# 推荐模板：左 / 右 / 中间布局

## 目标

公共推荐模板改为三种布局 + 保留「不使用模板」。左/右有侧栏色块；中间布局内容铺满底层，数字人透明叠在上层。

## 决策

- 替换现有 `business` / `spotlight` / `soft`，不新增并存。
- 展示名：左布局 / 右布局 / 中间布局。
- 左/右保留深蓝侧栏衬底；中间无侧栏色块。

## 模板定义（1920×1080）

| id | 名称 | background | slide | avatar | defaultAvatar |
|---|---|---|---|---|---|
| `none` | 不使用模板 | 不变 | null | null | none |
| `left` | 左布局 | `1A2744` | 右内容区 | 左侧栏全高 | female |
| `right` | 右布局 | `1A2744` | 左内容区 | 右侧栏全高 | female |
| `center` | 中间布局 | `F5F5F5` | 满幅 | 水平居中贴底 | female |

几何原则：左/右镜像对称；中间 slide 满幅，avatar 槽水平居中。

## 合成

- `avatarPlacement`：槽位中心靠近画面中线时水平居中；否则贴左或贴右；一律贴底。
- 人像仍用现有透明抠图 PNG；中间布局靠「无侧栏色块 + 叠在内容上」体现透明。
- `avatarDisplayScale` 保持现状，不在本次改动。

## 兼容

`retiredTemplates` 单跳映射到新 id：

- `business` / `spotlight` 及原映射到它们的旧 id → `right`
- `soft` / `card` → `center`

## 测试

- 模板数量仍为 4：`none` / `left` / `right` / `center`
- 矩形不越界
- 左/右 avatar 贴底且贴对应侧缘；中间 avatar 贴底且水平居中
- `none` 时肖像槽行为不变；`center` 有 avatar 槽

## 范围外

- 不改数字人资源与口型管线
- 不改「不使用模板」成片路径
- 不在本次调整显示缩放比例
