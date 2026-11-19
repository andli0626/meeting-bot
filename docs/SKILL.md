---
name: create-weekly-meeting
description: 在新点 OA 系统（oa.epoint.com.cn）中创建部门周例会。当用户要求创建周例会、新增会议、发布会议通知时使用。自动化完成从打开会议看板到填写会议信息、选择参会人员、添加议题并保存草稿的全流程。
---

# 创建部门周例会

## 概述

在新点 OA 系统中自动化创建"研发4部-1组周例会"。该 Skill 通过浏览器模拟 UI 操作完成全流程，因为 OA 系统的表单提交使用特殊编码格式（commonDto），且涉及动态 dialogId 和多步关联操作。

## 执行流程

### 步骤 1：导航到 OA 主页并打开会议管理

```
navigate → https://oa.epoint.com.cn/epointoa9/frame/fui/pages/themes/aide/aide?pageId=aide
```

确认页面标题为"新点网上协同办公平台"。

### 步骤 2：进入会议看板

1. 点击顶部菜单中的"我的会议"图标（`.modicon-1`）
2. 页面将打开会议看板标签页
3. 确认页面标题变为"会议看板"

### 步骤 3：点击"新增会议"按钮

1. 点击会议看板页面中的"新增会议"按钮（`#btnAdd`）
2. 等待新增会议对话框打开
3. 确认对话框标题为"会议管理-新增"

### 步骤 4：填写会议基本信息

**会议名称格式**: `会议名称：研发4部-1组周例会-{年份}年第{期数}期-{MMDD}`

- 期数 = 当前日期是该年的第几周（如第28周则为"第28期"）
- MMDD = 当前月份和日期（如9月24日为"0924"）

1. 点击会议名称输入框（`#meetingname$text`）
2. 输入完整的会议名称
3. 触发 change 事件使表单识别

### 步骤 5：选择会议室类型

**重要提示**：会议室类型使用 mini-ui 复合 checkbox 组件渲染。

1. 找到会议室类型选择区域（包含"线上会议室"、"线下会议室（公司）"、"线下会议室（非公司）"）
2. 点击"线下会议室（公司）"对应的复选框内的 generic focusable 元素
3. 在勾选前，主文档中对应的 checkbox input（`input[type=checkbox]`）需要被点击以触发状态变化
4. 如果选择线上会议室或线下会议室（非公司），需要额外填写会议室链接或地址字段

**最佳实践**：使用 evaluate 操作主文档中的 checkbox：
```javascript
// 点击第一个 checkbox 来切换
document.querySelectorAll('input[type=checkbox]')[0].click();
```

如果选择"线下会议室（非公司）"，会出现"非公司会议室"文本框，需要填写会议室地址。

### 步骤 6：填写会议室信息（如需要）

如果选择了线上会议室或线下会议室（非公司）：
1. 点击会议室输入框（`#meetingroomother$text`）
2. 输入会议室链接或地址信息（如腾讯会议链接）

### 步骤 7：选择参会人员

1. 点击"选择用户"按钮（打开人员选择对话框）
2. 人员选择对话框使用 iframe 内的 mini-ui 树形组件渲染
3. 使用 evaluate 访问 iframe 内的 DOM：

```javascript
// 访问人员选择 iframe
var fd = document.getElementsByTagName('iframe')[0].contentDocument;

// 遍历所有树节点，找到目标人员并勾选
var nodes = fd.querySelectorAll('.mini-tree-nodetext');
var targets = ['戴科','黄赟博','徐灵杰','曹俞澄','周胜宇','杨世杰','杨赛','周志银'];
for (var i = 0; i < nodes.length; i++) {
  var name = nodes[i].textContent.trim();
  if (targets.indexOf(name) >= 0) {
    var row = nodes[i].closest('tr');
    var cb = row.querySelector('.mini-tree-checkbox');
    if (cb) cb.click();
  }
}
```

4. 勾选完成后，使用 evaluate 点击"确定选择"按钮：

```javascript
document.getElementsByTagName('iframe')[0].contentDocument.getElementById('addClose').click();
```

**常用参会人员**（根据录制数据中的固定团队）：
- 戴科 (e92eb9b1-975a-447a-b3c4-2e61b67d443d)
- 黄赟博 (2894e5ad-241b-49de-bc2e-cd106f94675d)
- 徐灵杰 (8dcd74d1-3609-4396-8c03-3a0513a64b5e)
- 曹倢澄 (99d6612e-0a28-41c8-879a-187596b0534a)
- 周胜宇 (22f13352-7505-4df3-86d9-53fc81e176c5)
- 杨世杰 (bba2487c-03c2-4d02-ab78-cea80c43b7f6)
- 周志银 (bec8b4ae-ab17-4f43-a840-dd8ecd744461)
- 杨赛 (81b759d6-2441-4f7f-aa5b-3d63a5e65a73)

**注意**：人员列表中"曹倢澄"可能显示为"曹俞澄"，勾选时需同时匹配两个名称。

### 步骤 8：新增议题

1. 点击"新增议题"按钮
2. 等待议题编辑对话框打开
3. 填写议题名称（如"本周工作进展同步"）
4. 填写议题内容（如"本周工作进展同步"）
5. 点击"保存议题"按钮
6. 在确认对话框中点击"确定"

### 步骤 9：保存草稿

1. 返回会议管理-新增对话框
2. 点击"保存草稿"按钮
3. 在确认对话框中点击"确定"
4. 验证保存成功（页面无错误提示）

## 关键表单字段说明

### 会议基本信息表单字段

| 字段 ID | 说明 | 示例值 |
|---------|------|--------|
| `rowguid` | 会议唯一标识（自动生成的 GUID） | f3d4f925-e95d-451e-b01b-02f91e6d0c07 |
| `modelguid` | 会议模板（研发中心4号开发单元会议） | 5fa25cb0-71a8-4086-b223-edd7e7e0cded |
| `meetingtype` | 会议类型（基层合伙单元会议） | 0203 |
| `meetingname` | 会议名称 | 会议名称：研发4部-1组周例会-2026年第28期-0924 |
| `meetingdate` | 会议日期（默认当天） | 2026-09-17 |
| `meetingexplain` | 会议说明 | （可为空） |

### 议题表单字段

| 字段 ID | 说明 | 示例值 |
|---------|------|--------|
| `topicname` | 议题名称 | 本周工作进展同步 |
| `topiclabel` | 议题标签（1=ST议题，2=AT议题，0=其他议题） | 1 |
| `topiccontent` | 议题内容 | 本周工作进展同步 |

## 人员选择说明

人员选择对话框使用树形结构展示，checkbox ID 格式为 `#mini-6$checkbox$N`，其中 N 是动态编号。要勾选特定人员，需要：

1. 先打开人员选择对话框
2. 在树中找到目标人员节点
3. 点击对应的 checkbox 勾选
4. 勾选后系统会自动更新已选人员列表

**最佳实践（已验证）**：
- 人员列表渲染在 iframe 内，使用 `document.getElementsByTagName('iframe')[0].contentDocument` 访问
- 树节点文本使用 `.mini-tree-nodetext` 选择器定位
- 每个人员行内使用 `.mini-tree-checkbox` 定位复选框
- 会议室复选框在主文档中，使用 `document.querySelectorAll('input[type=checkbox]')[0].click()` 触发
- 所有 evaluate 操作建议通过 PowerShell 的 `&` 调用运算符执行，避免 cmd /c 的引号问题

## 注意事项

1. **登录态**：浏览器会自动携带 Cookie，无需手动传认证信息
2. **动态 ID**：`_dialogId_` 和 `_winid` 是动态生成的，不需要硬编码
3. **表单编码**：所有表单数据使用 `application/x-www-form-urlencoded` 格式提交
4. **会议名称格式**：严格按照 `{部门}-{组}周例会-{年份}年第{期数}期-{MMDD}` 格式生成
5. **参会人员**：可以根据需要增减，录制数据中的人员是研发4部-1组的固定团队成员
6. **会议室必填**：点击"新增议题"前必须确保会议室复选框处于勾选状态，否则会触发"会议形式验证失败"错误
7. **人员选择 iframe**：人员树形列表在 iframe 内渲染，无法通过快照 refs 直接访问，必须使用 evaluate 操作
8. **勾选后刷新**：每次打开人员选择对话框时，之前勾选的人员不会自动保留，需要重新勾选
