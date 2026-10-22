# 常用转场精选

## 目标

参考 PPT 日常高频转场，在现有 5 种基础上补齐精选常用效果；每种方向类只保留一个默认方向，避免选项膨胀。

## 决策

- 范围：精选扩容，不按 PPT 全部分类铺开。
- 方向：擦除 / 滑入 / 推入各保留一个默认方向（向左）。
- 实现：继续走 FFmpeg `xfade`，只扩展 `effects` 与 `xfadeName` 映射。
- UI：沿用创建页 `choice-row` 自动渲染，无需分组面板。

## 转场列表

| id | 展示名 | xfade | 说明 |
|---|---|---|---|
| `cut` | 直接切换 | — | 无过渡 |
| `fade` | 淡入淡出 | `fade` | 默认 |
| `slide` | 向左滑入 | `slideleft` | 现有 |
| `wipe` | 向左擦除 | `wipeleft` | 现有 |
| `circle` | 圆形展开 | `circleopen` | 现有 |
| `dissolve` | 溶解 | `dissolve` | 对应 PPT 溶解 |
| `fadeblack` | 淡入黑 | `fadeblack` | 经黑过渡 |
| `zoomin` | 缩放 | `zoomin` | 对应 PPT 缩放 |
| `split` | 劈裂 | `vertopen` | 对应 PPT 劈裂 |
| `cover` | 推入 | `coverleft` | 对应 PPT 飞入/推入感 |
| `blinds` | 百叶窗 | `hlslice` | 对应 PPT 百叶窗 |

## 兼容

- 旧 id（`cut` / `fade` / `slide` / `wipe` / `circle`）保持不变。
- 默认仍为 `fade`。

## 测试

- `parseEffect` 接受新增 id，拒绝未知 id。
- `transitionName` 对非 `cut` 均返回对应 xfade 名。
