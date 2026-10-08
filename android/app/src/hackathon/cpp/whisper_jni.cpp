#include <jni.h>
#include <whisper.h>
#include <atomic>
#include <algorithm>
#include <memory>
#include <string>
#include <vector>

struct ReviewWhisper { whisper_context *ctx; std::atomic<bool> cancelled{false}; };
static void quiet_log(ggml_log_level, const char *, void *) {} // No source speech in logs.
static bool abort_review(void *data) { return static_cast<ReviewWhisper *>(data)->cancelled.load(); }
static void fail(JNIEnv *env) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), "Multilingual transcription could not finish. Try Hindi or English fallback.");
}
static jstring utf8(JNIEnv *env, const std::string &value) {
    auto bytes = env->NewByteArray(static_cast<jsize>(value.size()));
    if (!bytes) return nullptr;
    env->SetByteArrayRegion(bytes, 0, static_cast<jsize>(value.size()), reinterpret_cast<const jbyte *>(value.data()));
    auto cls = env->FindClass("java/lang/String");
    auto ctor = env->GetMethodID(cls, "<init>", "([BLjava/lang/String;)V");
    auto encoding = env->NewStringUTF("UTF-8");
    auto result = static_cast<jstring>(env->NewObject(cls, ctor, bytes, encoding));
    env->DeleteLocalRef(bytes); env->DeleteLocalRef(encoding); env->DeleteLocalRef(cls);
    return result;
}
extern "C" JNIEXPORT jlong JNICALL
Java_in_aiprotect_companion_WhisperNative_create(JNIEnv *env, jclass, jstring model_path) {
    whisper_log_set(quiet_log, nullptr);
    const char *path = env->GetStringUTFChars(model_path, nullptr);
    if (!path) return 0;
    auto params = whisper_context_default_params(); params.use_gpu = false;
    auto *ctx = whisper_init_from_file_with_params(path, params);
    env->ReleaseStringUTFChars(model_path, path);
    if (!ctx) return 0;
    if (!whisper_is_multilingual(ctx)) { whisper_free(ctx); return 0; }
    return reinterpret_cast<jlong>(new ReviewWhisper{ctx});
}
extern "C" JNIEXPORT jobjectArray JNICALL
Java_in_aiprotect_companion_WhisperNative_transcribe(JNIEnv *env, jclass, jlong pointer, jfloatArray input, jstring hint, jint threads) {
    auto *review = reinterpret_cast<ReviewWhisper *>(pointer);
    const auto count = env->GetArrayLength(input);
    if (!review || count <= 0 || count > 30 * WHISPER_SAMPLE_RATE) { fail(env); return nullptr; }
    std::vector<float> samples(static_cast<size_t>(count));
    env->GetFloatArrayRegion(input, 0, count, samples.data());
    if (env->ExceptionCheck()) return nullptr;
    const char *lang = env->GetStringUTFChars(hint, nullptr);
    if (!lang) return nullptr;
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = std::max(1, std::min(4, static_cast<int>(threads)));
    params.translate = false; params.no_context = true; params.no_timestamps = false;
    params.print_special = false; params.print_progress = false;
    params.print_realtime = false; params.print_timestamps = false;
    params.language = lang; params.detect_language = false;
    params.max_len = 1600; params.split_on_word = true;
    params.abort_callback = abort_review; params.abort_callback_user_data = review;
    const int status = review->cancelled.load() ? -1 : whisper_full(review->ctx, params, samples.data(), count);
    env->ReleaseStringUTFChars(hint, lang);
    std::fill(samples.begin(), samples.end(), 0.0f);
    if (status != 0 || review->cancelled.load()) { fail(env); return nullptr; }
    const int segments = whisper_full_n_segments(review->ctx);
    if (segments < 0 || segments > 512) { fail(env); return nullptr; }
    auto cls = env->FindClass("java/lang/String");
    auto result = env->NewObjectArray(segments * 4, cls, nullptr); env->DeleteLocalRef(cls);
    if (!result) return nullptr;
    const char *detected = whisper_lang_str(whisper_full_lang_id(review->ctx));
    for (int i = 0; i < segments; ++i) {
        const std::string values[] = {
            std::to_string(whisper_full_get_segment_t0(review->ctx, i) * 10),
            std::to_string(whisper_full_get_segment_t1(review->ctx, i) * 10),
            detected ? detected : "unknown", whisper_full_get_segment_text(review->ctx, i)
        };
        for (int field = 0; field < 4; ++field) {
            auto value = utf8(env, values[field]);
            if (env->ExceptionCheck()) return nullptr;
            env->SetObjectArrayElement(result, i * 4 + field, value); env->DeleteLocalRef(value);
        }
    }
    return result;
}
extern "C" JNIEXPORT void JNICALL
Java_in_aiprotect_companion_WhisperNative_cancel(JNIEnv *, jclass, jlong pointer) {
    if (auto *review = reinterpret_cast<ReviewWhisper *>(pointer)) review->cancelled.store(true);
}
extern "C" JNIEXPORT void JNICALL
Java_in_aiprotect_companion_WhisperNative_free(JNIEnv *, jclass, jlong pointer) {
    if (auto *review = reinterpret_cast<ReviewWhisper *>(pointer)) { whisper_free(review->ctx); delete review; }
}
