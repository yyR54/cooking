import json
import numpy as np
from nltk.translate.bleu_score import corpus_bleu, SmoothingFunction

# 加载数据
with open('done.json', 'r', encoding='utf-8') as f:
    sys_data = json.load(f)['list']

with open('done_data.json', 'r', encoding='utf-8') as f:
    gt_data = json.load(f)

def get_video_name(filename):
    return filename.replace('.mp4', '')

all_hyp = []   # 生成描述
all_ref = []   # 参考描述
all_ious = []  # 每个对齐步骤的 IoU

for video in sys_data:
    vid_name = get_video_name(video['name'])
    if vid_name not in gt_data:
        print(f"警告：{vid_name} 不在标注数据中，跳过")
        continue
    
    # 获取 eventsStack 并按 start 时间排序
    events = video.get('eventsStack', [])
    if not events:
        print(f"警告：{vid_name} 没有 eventsStack，跳过")
        continue
    sorted_events = sorted(events, key=lambda x: x['start'])
    gen_steps = [ev['action'] for ev in sorted_events]
    gen_starts = [ev['start'] for ev in sorted_events]
    gen_ends   = [ev['end'] for ev in sorted_events]
    
    # 获取标注（已按时间顺序，但确保排序）
    gt_ann = gt_data[vid_name]['annotations']
    gt_sorted = sorted(gt_ann, key=lambda x: x['segment'][0])
    ref_steps = [ann['sentence'] for ann in gt_sorted]
    ref_times = [ann['segment'] for ann in gt_sorted]
    
    # 对齐到最小长度
    min_len = min(len(gen_steps), len(ref_steps))
    gen_aligned = gen_steps[:min_len]
    ref_aligned = ref_steps[:min_len]
    gen_start_aligned = gen_starts[:min_len]
    gen_end_aligned = gen_ends[:min_len]
    ref_times_aligned = ref_times[:min_len]
    
    # 收集 BLEU 数据
    for g, r in zip(gen_aligned, ref_aligned):
        all_hyp.append(g)
        all_ref.append([r])
    
    # 计算 IoU
    for i in range(min_len):
        pred = [gen_start_aligned[i], gen_end_aligned[i]]
        gt = ref_times_aligned[i]
        inter = max(0, min(pred[1], gt[1]) - max(pred[0], gt[0]))
        union = (pred[1] - pred[0]) + (gt[1] - gt[0]) - inter
        iou = inter / union if union > 0 else 0
        all_ious.append(iou)

print(f"总参与评估的步骤数: {len(all_ious)}")

# BLEU-4 (字符级)
hyp_chars = [list(s.replace(' ', '')) for s in all_hyp]
ref_chars = [[list(r[0].replace(' ', ''))] for r in all_ref]
smooth = SmoothingFunction().method1
bleu = corpus_bleu(ref_chars, hyp_chars, smoothing_function=smooth)
print(f"BLEU-4: {bleu:.4f}")

# IoU 指标
ious = np.array(all_ious)
mIoU = np.mean(ious)
print(f"mIoU: {mIoU:.4f}")
for thresh in [0.3, 0.5, 0.7]:
    r1 = np.mean(ious > thresh)
    print(f"R1@{thresh}: {r1:.4f}")