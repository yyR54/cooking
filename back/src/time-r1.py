import argparse
import torch
import os
import re
import json
import time
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import JSONResponse
from transformers import AutoProcessor
from src.vllm_inference.vllm_infer import vllmWrapper
from src.vllm_inference.utils import monkey_patch
from src.utils import process_vision_info_v3
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ===================== 参数设置 =====================
monkey_patch()

PROMPT_TEMPLATE = """
To accurately pinpoint the event "{}" in the video, determine the precise time period of the event.

Output your thought process within the   tags, including analysis with either specific time ranges (xx.xx to xx.xx) in <timestep> </timestep> tags.

Then, provide the start and end times (in seconds, precise to two decimal places) in the format "start time to end time" within the <answer> </answer> tags. For example: "12.54 to 17.83".
"""

# ===================== 预处理函数 =====================
def get_args():
    parser = argparse.ArgumentParser(
        description="Evaluation for training-free video temporal grounding (Single GPU Version)"
    )
    parser.add_argument(
        "--model_base", type=str, default="./ckpts/Time-R1-7B"
    )
    parser.add_argument("--batch_size", type=int, default=1, help="Batch size")
    parser.add_argument(
        "--output_dir",
        type=str,
        default="logs/demo",
        help="Directory to save checkpoints",
    )
    parser.add_argument(
        "--device", type=str, default="cuda:0", help="GPU device to use"
    )
    parser.add_argument(
        "--pipeline_parallel_size", type=int, default=1, help="GPU nodes"
    )
    parser.add_argument(
        "--video_path", type=str, default="./assets/OHOFG.mp4"
    )
    parser.add_argument(
        "--query", type=str, default="person sitting down in a chair."
    )
    parser.add_argument("--max_new_tokens", type=int, default=128)
    parser.add_argument(
        "--total_pixels", type=int, default=3584 * 28 * 28, help="total_pixels"
    )
    return parser.parse_args()

# ===================== 预处理函数=====================
def preprocess(processor, itm, ele):
    if "video_start" in itm and itm["video_start"] is not None:
        ele["video_start"] = itm["video_start"]
    if "video_end" in itm and itm["video_end"] is not None:
        ele["video_end"] = itm["video_end"]

    messages = [
        {"role": "system", "content": []},
        {"role": "user", "content": []},
    ]
    messages[0]["content"].append({"type": "text", "text": "You are a helpful assistant."})
    messages[1]["content"].append({"type": "video", "video": itm["video"], **ele})
    messages[1]["content"].append(
        {"type": "text", "text": PROMPT_TEMPLATE.format(itm["sentence"])}
    )
    _, video_inputs, utils = process_vision_info_v3(messages, return_video_kwargs=True)
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    return {"text": text, "videos": video_inputs, "fps": utils["fps"]}

def build_dataset(data, processor, args):
    kwargs = {
        "min_pixels": 16 * 28 * 28,
        "total_pixels": args.total_pixels,
        "sys_prompt": "You are a helpful assistant.",
    }
    ele = {
        "min_pixels": 16 * 28 * 28,
        "total_pixels": args.total_pixels,
    }
    inputs = preprocess(processor, data, ele)

    multi_modal_data = {}
    if "videos" in inputs and inputs["videos"] is not None:
        multi_modal_data["video"] = inputs["videos"]
    
    return {
        "inputs": {
            "raw_prompt_ids": [processor.tokenizer.encode(inputs["text"], add_special_tokens=False)],
            "multi_modal_data": [multi_modal_data],
            "mm_processor_kwargs": [{"fps": inputs["fps"]} if inputs["fps"] else {}],
        }
    }

def extract_answer(output_string):
    matches = re.findall(r"(\d+\.?\d*) (to|and) (\d+\.?\d*)", output_string)
    if not matches:
        answer_match = re.search(r"<answer>(.*?)</answer>", output_string)
        if answer_match:
            answer_content = answer_match.group(1).strip()
            answer_matches = re.findall(r"(\d+\.?\d*) (to|and) (\d+\.?\d*)", answer_content)
            if answer_matches:
                last_match = answer_matches[-1]
                return [float(last_match[0]), float(last_match[2])]
        return [None, None]
    last_match = matches[-1]
    try:
        return [float(last_match[0]), float(last_match[2])]
    except:
        return [None, None]

# ===================== 批量推理函数 =====================
def infer_single_action(processor, model, args, video_path, action):
    data = {
        "video": video_path,
        "duration": 35.04,
        "timestamp": [1.0, 7.5],
        "sentence": action,
    }
    data = build_dataset(data, processor, args)
    output_texts = model.generate(data["inputs"], max_new_tokens=args.max_new_tokens)
    pred = extract_answer(output_texts[0])
    return pred, output_texts[0]

# ===================== API 服务 =====================
app = FastAPI(title="Time-R1 Demo API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局模型
args = None
processor = None
model = None

@app.on_event("startup")
def startup_load_model():
    global args, processor, model
    args = get_args()
    processor = AutoProcessor.from_pretrained(args.model_base, use_fast=True)
    processor.tokenizer.padding_side = "left"
    model = vllmWrapper(args)
    print("模型加载完成")

@app.post("/analyze_video")
async def analyze_video(
    video: UploadFile = File(...),
    actions_json: str = Form(...)
):
    # 保存上传视频
    video_path = f"/tmp/{video.filename}"
    with open(video_path, "wb") as f:
        f.write(await video.read())

    # 解析动作
    actions = json.loads(actions_json)
    results = []

    # 批量推理（串行，不卡死）
    for action in actions:
        try:
            pred, output = infer_single_action(processor, model, args, video_path, action)
            results.append({
                "action": action,
                "start": round(pred[0], 2) if pred[0] else None,
                "end": round(pred[1], 2) if pred[1] else None,
                "think": output, 
                "status": "success"
            })
        except Exception as e:
            results.append({
                "action": action,
                "status": "failed",
                "error": str(e)
            })

    os.remove(video_path)
    return {
        "code": 200,
        "data": results
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=1088)