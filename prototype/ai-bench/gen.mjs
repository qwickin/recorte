// Usage: node gen.mjs <florence|smolvlm>  — timing of generative captioners on 3 captures (2 threads).
import { AutoProcessor, Florence2ForConditionalGeneration, AutoModelForVision2Seq, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";
env.cacheDir = new URL("./models/", import.meta.url).pathname;
const SHOTS = "/Users/kali/.t3/projects/screenshotextension/prototype/gallery/public/shots/";
const which = process.argv[2];
const session_options = { intraOpNumThreads: 2, interOpNumThreads: 1 };
const ids = ["pastel-nata-1", "osm-lisboa-1", "gh-react-1"];
const img = async (id) => { const { data, info } = await sharp(`${SHOTS}${id}-t.webp`).resize({ width: 768, height: 768, fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3); };
let peak = 0; const sample = () => (peak = Math.max(peak, process.memoryUsage().rss));
const t0 = performance.now();
if (which === "florence") {
  const id = "onnx-community/Florence-2-base-ft";
  const model = await Florence2ForConditionalGeneration.from_pretrained(id, { dtype: "q8", session_options });
  const proc = await AutoProcessor.from_pretrained(id);
  console.log("load", Math.round(performance.now() - t0), "ms");
  for (const c of ids) {
    const s = performance.now(); const image = await img(c); const task = "<MORE_DETAILED_CAPTION>";
    const inputs = await proc(image, proc.construct_prompts(task));
    const out = await model.generate({ ...inputs, max_new_tokens: 80 }); sample();
    const text = proc.batch_decode(out, { skip_special_tokens: false })[0];
    console.log(c, Math.round(performance.now() - s), "ms |", JSON.stringify(proc.post_process_generation(text, task, image.size)[task]).slice(0, 220));
  }
} else {
  const id = "HuggingFaceTB/SmolVLM-256M-Instruct";
  const proc = await AutoProcessor.from_pretrained(id);
  const model = await AutoModelForVision2Seq.from_pretrained(id, { dtype: { embed_tokens: "fp32", vision_encoder: "fp32", decoder_model_merged: "q8" }, session_options });
  console.log("load", Math.round(performance.now() - t0), "ms");
  for (const c of ids) {
    const s = performance.now(); const image = await img(c);
    const messages = [{ role: "user", content: [{ type: "image" }, { type: "text", text: "List 6 short tags describing this web page screenshot, comma separated." }] }];
    const inputs = await proc(proc.apply_chat_template(messages, { add_generation_prompt: true }), [image], { do_image_splitting: false });
    const out = await model.generate({ ...inputs, max_new_tokens: 40, do_sample: false }); sample();
    const text = proc.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0];
    console.log(c, Math.round(performance.now() - s), "ms |", text.trim().slice(0, 200));
  }
}
console.log("peakRssMB", Math.round(peak / 1048576));
