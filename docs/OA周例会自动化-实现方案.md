# 新点OA周例会自动化 - 实现方案

## 一、项目概述

### 1.1 背景

新点OA系统（oa.epoint.com.cn）中创建周例会是一个重复性操作，每次需要手动完成登录、导航到会议看板、填写表单、选择参会人员、添加议题等步骤。本方案通过**Tampermonkey 油猴脚本**实现全流程自动化，减少人工操作，提高创建效率。

### 1.2 目标

- 自动化完成"研发4部-1组周例会"创建流程
- 支持每周运行，自动计算会议期数和日期
- 支持参会人员配置化，方便团队人员变动时调整
- 具备容错和重试机制，提高成功率

### 1.3 技术约束

- 运行平台：Windows 浏览器（Chrome / Edge 为主）
- 用户已登录：OA 系统需要登录态（Cookie），由用户自行登录，脚本不处理登录逻辑
- 安装 Tampermonkey 扩展（免费开源）
- 遵循 OA 系统的使用规范，不绕过权限控制

---

## 二、技术选型

### 2.1 Tampermonkey 油猴脚本

| 对比维度 | Tampermonkey | Chrome 插件 | Puppeteer/Playwright |
|---------|-------------|-------------|---------------------|
| 开发成本 | ⭐⭐⭐⭐⭐ 极低 | ⭐⭐ 中等 | ⭐ 高 |
| 部署难度 | ⭐⭐⭐⭐⭐ 一键安装 | ⭐⭐⭐ 需打包签名 | ⭐ 需 Node.js 环境 |
| 维护成本 | ⭐⭐⭐⭐ 改代码即生效 | ⭐⭐⭐ 需重新打包 | ⭐⭐⭐⭐ |
| UI 操作能力 | ⭐⭐⭐⭐⭐ 原生 DOM | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 跨域请求 | ⭐⭐⭐⭐ 支持 GM_xmlhttpRequest | ⭐⭐⭐⭐⭐ manifest 声明 | ⭐⭐⭐⭐⭐ |
| 团队共享 | ⭐⭐⭐⭐⭐ 文件分发 | ⭐⭐⭐ 需上架商店 | ⭐⭐⭐ |
| 配置持久化 | ⭐⭐⭐⭐ GM_setValue + localStorage | ⭐⭐⭐⭐⭐ chrome.storage | ⭐⭐⭐⭐ |

**结论**：选择 Tampermonkey，开发最快、部署最轻、团队共享最简单。

---

## 三、整体架构

```
┌─────────────────────────────────────────────┐
│              用户交互层                        │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐ │
│  │ 配置面板 │  │ 手动触发 │  │ 定时自动触发  │ │
│  └────┬────┘  └────┬────┘  └──────┬───────┘ │
│       └─────────────┼──────────────┘          │
├─────────────────────┼───────────────────────┤
│              脚本引擎层                        │
│  ┌──────────────────┼──────────────────────┐│
│  │   任务调度器      │    状态管理器         ││
│  │  (ScheduleMgr)   │   (StateManager)     ││
│  └────────┬─────────┴──────────────────────┘│
│           │                                  │
│  ┌────────┴─────────────────────────────────┐│
│  │            浏览器操作引擎                   ││
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ││
│  │  │页面导航  │ │元素定位   │ │事件模拟    │ ││
│  │  └─────────┘ └──────────┘ └───────────┘ ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│              外部接口层                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ OA 页面   │  │ GM API   │  │ localStorage│ │
│  │ DOM 操作  │  │ 数据存储  │  │  配置管理   │ │
│  └──────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────┘
```

### 3.1 核心模块说明

**任务调度器**：管理自动化流程的步骤编排，支持顺序执行、条件分支和错误重试。

**状态管理器**：记录当前执行进度（当前步骤、已完成的页面、失败次数），支持断点续跑。

**浏览器操作引擎**：封装页面导航、元素查找、点击、输入等基础操作，提供统一的调用接口和错误处理。

**配置中心**：存储参会人员列表、会议名称模板、目标URL等可配置参数，支持通过 localStorage 持久化。

---

## 四、目录结构设计

```
oa-weekly-meeting/
├── oa-weekly-meeting.user.js          # 主入口（Tampermonkey 脚本）
├── src/
│   ├── config.js                       # 配置文件（人员、模板、URL）
│   ├── core/
│   │   ├── BrowserEngine.js            # 浏览器操作引擎
│   │   ├── TaskScheduler.js             # 任务调度器
│   │   ├── StateManager.js             # 状态管理器
│   │   └── Logger.js                   # 日志系统
│   ├── steps/
│   │   ├── Step1_NavigateToOA.js       # 导航到OA
│   │   ├── Step2_OpenMeetingBoard.js   # 打开会议看板
│   │   ├── Step3_CreateNewMeeting.js   # 点击新增会议
│   │   ├── Step4_FillMeetingInfo.js    # 填写会议信息
│   │   ├── Step5_SelectRoomType.js     # 选择会议室类型
│   │   ├── Step6_SelectParticipants.js # 选择参会人员
│   │   ├── Step7_AddAgenda.js          # 新增议题
│   │   └── Step8_SaveDraft.js          # 保存草稿
│   └── utils/
│       ├── dom.js                      # DOM 工具函数
│       ├── waiter.js                   # 等待策略
│       └── helpers.js                  # 辅助函数
├── assets/
│   └── icons/                          # 图标资源
└── docs/
    ├── IMPLEMENTATION.md               # 实现方案文档
    └── TESTING.md                      # 测试指南文档
```

---

## 五、核心模块详细设计

### 5.1 配置中心 (CONFIG)

配置集中在一个 `CONFIG` 对象中，包含以下分组：

| 分组 | 作用 | 自定义建议 |
|------|------|----------|
| `autoRun` | 是否自动执行完整流程 | 日常使用设为 `false`，通过菜单手动触发 |
| `urls` | 目标页面地址 | OA URL 变更时修改 |
| `meeting` | 会议名称模板和类型参数 | 修改部门名称时调整 |
| `participants` | 参会人员列表（含 UUID） | 人员变动时更新 |
| `agenda` | 默认议题信息 | 修改议题主题时调整 |
| `selectors` | DOM 选择器集合 | OA 页面结构变化时更新 |
| `timing` | 超时、重试、轮询等时序参数 | 网络环境差时可适当增大超时 |

**关键配置说明：**

- `autoRun: false` — 默认关闭自动执行，避免访问 OA 主页时意外触发会议创建
- `lockTimeout: 120000` — 执行锁的超时时间（2 分钟），防止脚本中断后刷新页面导致永久锁死
- `selectors.confirmSelectBtn` — 人员选择对话框专用的确定按钮选择器，与通用 `confirmBtn` 分离，避免误点
- `selectors.roomTypeOffline` — 会议室类型选择，直接操作主文档中的 `<input type="checkbox">`（mini-ui 组件需操作真实 DOM）

### 5.2 浏览器操作引擎

脚本使用函数式风格封装浏览器操作，核心函数如下：

| 函数 | 作用 | 关键特性 |
|------|------|---------|
| `waitFor(ms)` | 固定延时 | 用于步骤间的缓冲等待 |
| `waitForElement(selector, options)` | 轮询等待元素出现 | 支持自定义超时和轮询间隔 |
| `waitForElementGone(selector, timeout)` | 等待元素消失 | 用于确认对话框关闭 |
| `waitForTitle(expectedTitle, timeout)` | 等待页面标题变化 | 用于验证页面跳转成功 |
| `safeClick(element)` | 安全点击 | 先 `scrollIntoView` 再 `click` |
| `safeInput(element, text, options)` | 安全输入 | 聚焦 → 清空 → 设值 → 触发 input/change/blur 事件 |

### 5.3 人员查找策略

OA 系统的人员选择对话框使用 mini-ui 树形组件，可能渲染在主文档或 iframe 中。`findUserNode` 函数采用两阶段查找：

1. **主文档查找**：使用 `.tree-node, .user-node, .mini-tree-nodetext` 等选择器
2. **iframe 回退**：如果主文档未找到，遍历所有 iframe 尝试访问其 `contentDocument`

选择器列表覆盖多种可能的 DOM 结构，适配 mini-ui 的不同版本。

### 5.4 任务调度器 (TaskScheduler)

使用对象字面量实现，支持步骤注册、顺序执行和自动重试：

- **步骤注册**：通过 `addStep(name, fn)` 添加步骤
- **顺序执行**：`execute()` 方法按注册顺序依次执行
- **自动重试**：每个步骤失败后自动重试，最多 `CONFIG.timing.maxRetries` 次
- **错误隔离**：单步骤失败不影响其他步骤的错误记录

### 5.5 状态管理与锁机制

使用 `GM_setValue` / `GM_getValue` 持久化执行状态：

| 状态 Key | 说明 | 使用场景 |
|---------|------|---------|
| `oa_running` | 是否正在执行 | 防止重复触发 |
| `oa_lock_time` | 锁获取时间戳 | 配合 lockTimeout 检测过期锁 |
| `oa_step` | 当前步骤编号 | 执行进度跟踪 |

**锁超时自动清理**：`checkLockTimeout()` 函数在每次执行前检查锁是否过期。如果距离 `oa_lock_time` 超过 `lockTimeout`（默认 2 分钟），自动清除锁，防止刷新页面后永久锁死。

---

## 六、完整流程实现

### 6.1 主流程时序图

```
用户/定时触发
    │
    ▼
┌─────────────────────────┐
│ 1. 检查 GM_setValue 状态  │
│    如果正在执行 → 退出    │
└────────┬────────────────┘
         │ 设置 oa_running = true
         ▼
┌─────────────────────────┐
│ 2. 生成会议名称           │
│    year + period + MMDD  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 3. 导航到 OA 主页        │
│    等待页面加载完成      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 4. 点击 #menu-btn 展开菜单│
│    等待 800ms            │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 5. 点击"我的会议"图标    │
│    等待标题→"会议看板"   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 6. 点击"新增会议"按钮    │
│    等待对话框打开        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 7. 填写会议名称          │
│    触发 change 事件      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 8. 选择会议室类型        │
│    线下（公司）          │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 9. 点击"选择用户"        │
│    遍历人员树，勾选目标   │
│    点击"确定选择"        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 10. 新增议题             │
│    填写名称和内容        │
│    保存议题              │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 11. 保存草稿             │
│     确认保存              │
└────────┬────────────────┘
         │ 设置 oa_running = false
         ▼
      [完成]
```

### 6.2 步骤 4：打开会议看板实现

```javascript
async function openMeetingBoard() {
  Logger.step('打开会议看板');

  // ⚠️ 关键前置步骤：先点击 #menu-btn 展开左侧菜单
  //    菜单默认折叠，.modicon-1 图标在展开后才可见
  const menuBtn = await BrowserEngine.waitForElement('#menu-btn', { timeout: 5000 });
  if (menuBtn) {
    await BrowserEngine.click('#menu-btn');
    await BrowserEngine.waitFor(800); // 等待菜单展开动画
  }

  // 在展开的菜单中查找"我的会议"图标
  const icon = await BrowserEngine.waitForElement('.modicon-1', {
    timeout: 5000,
  });

  if (!icon) {
    throw new Error('未找到"我的会议"图标（请确认菜单已展开）');
  }

  // 执行点击
  await BrowserEngine.click('.modicon-1');

  // 等待会议看板页面加载（标题变为"会议看板"，这是独立页面导航）
  const loaded = await BrowserEngine.waitForTitle('会议看板', 10000);
  if (!loaded) {
    throw new Error('会议看板页面加载超时');
  }

  // 等待"新增会议"按钮出现确认加载完成
  await BrowserEngine.waitForElement('#btnAdd', 5000);

  Logger.success('会议看板已打开');
}
```

### 6.3 步骤 6：填写会议信息实现

```javascript
async function fillMeetingInfo() {
  Logger.step('填写会议基本信息');

  // 生成会议名称：研发4部-1组周例会-2026年第38期-0917
  const now = new Date();
  const year = now.getFullYear();
  const period = getISOWeekNumber(now); // ISO 8601 周数
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  
  const meetingName = `研发4部-1组周例会-${year}年第${period}期-${mmdd}`;

  Logger.info(`会议名称: ${meetingName}`);

  // 输入会议名称
  await BrowserEngine.input('#meetingname$text', meetingName, {
    clearFirst: true,
    triggerEvents: ['input', 'change', 'blur'],
  });

  // 选择会议室类型 - 线下会议室（公司）
  await BrowserEngine.click('.room-type-offline- company', {
    retryCount: 2,
  });

  Logger.success(`会议信息已填写: ${meetingName}`);
}

/**
 * 获取 ISO 8601 标准周数
 */
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
```

### 6.4 步骤 8：选择参会人员实现

```javascript
async function selectParticipants() {
  Logger.step('选择参会人员');

  // 1. 点击"选择用户"按钮，打开人员选择对话框
  await BrowserEngine.click('.select-user-btn');
  await BrowserEngine.waitForElement('.user-select-dialog', 5000);

  // 2. 等待人员树加载完成
  await BrowserEngine.waitForElement('.user-tree-node', 8000);

  // 3. 遍历目标人员，逐个勾选
  const targetParticipants = CONFIG.participants;

  for (const person of targetParticipants) {
    // 在人员树中查找目标人员
    // 人员树中可能包含姓名和工号，使用模糊匹配
    const node = await findUserNode(person.name, person.uuid);
    
    if (node) {
      const checkbox = node.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        await BrowserEngine.click(checkbox);
        Logger.success(`已勾选: ${person.name}`);
      }
    } else {
      Logger.warn(`未找到人员: ${person.name} (${person.uuid})`);
    }
  }

  // 4. 点击"确定选择"按钮
  await BrowserEngine.click('.confirm-select-btn');
  
  // 5. 等待对话框关闭
  await BrowserEngine.waitForElementGone('.user-select-dialog', 5000);

  Logger.success('参会人员已选择');
}

/**
 * 在人员树中查找目标人员节点
 * 支持模糊匹配姓名，并验证 uuid
 */
async function findUserNode(name, uuid) {
  // 等待树节点出现
  const nodes = document.querySelectorAll('.tree-node, .user-node, .participant-item');
  
  for (const node of nodes) {
    const text = node.textContent || '';
    // 匹配姓名（包含关系）
    if (text.includes(name)) {
      // 验证 UUID（如果节点有 data 属性）
      const nodeUuid = node.dataset?.uuid || node.dataset?.id || '';
      if (uuid && nodeUuid && nodeUuid !== uuid) {
        continue; // UUID 不匹配，跳过
      }
      return node;
    }
  }
  
  return null;
}
```

### 6.5 步骤 7-8：人员树遍历策略

OA 系统的人员选择对话框使用树形结构展示。遍历策略：

- **广度优先搜索**：遍历当前层级的所有节点，匹配目标人员
- **懒加载处理**：某些节点可能需要展开才能看到子节点，需要检测并触发展开
- **重试机制**：人员树可能异步加载，等待加载完成后重试查找
- **日志记录**：记录找到/未找到的人员，方便调试

### 6.6 步骤 9：新增议题实现

```javascript
async function addAgenda() {
  Logger.step('新增议题');

  // 1. 点击"新增议题"按钮
  await BrowserEngine.click('.add-agenda-btn');
  
  // 2. 等待议题编辑对话框
  await BrowserEngine.waitForElement('.agenda-dialog', 3000);
  
  // 3. 填写议题名称
  await BrowserEngine.input('#topicname', CONFIG.agenda.name);
  
  // 4. 填写议题内容
  await BrowserEngine.input('#topiccontent', CONFIG.agenda.content);
  
  // 5. 点击"保存议题"按钮
  await BrowserEngine.click('.save-agenda-btn');
  
  // 6. 确认对话框 - 点击"确定"
  await BrowserEngine.waitForElement('.confirm-dialog', 2000);
  await BrowserEngine.click('.confirm-btn');
  
  // 7. 等待对话框关闭
  await BrowserEngine.waitForElementGone('.agenda-dialog', 3000);

  Logger.success('议题已添加');
}
```

### 6.7 步骤 10：保存草稿实现

```javascript
async function saveDraft() {
  Logger.step('保存草稿');

  // 回到会议管理-新增对话框
  // 点击"保存草稿"按钮
  await BrowserEngine.click('.save-draft-btn');
  
  // 等待确认对话框
  await BrowserEngine.waitForElement('.confirm-dialog', 3000);
  await BrowserEngine.click('.confirm-btn');
  
  // 验证保存成功：检查是否有错误提示
  const error = await BrowserEngine.waitForElement('.error-msg', 2000).catch(() => null);
  if (error) {
    throw new Error(`保存失败: ${error.textContent}`);
  }
  
  // 检查是否有成功提示
  const success = document.querySelector('.success-msg, .toast-success');
  if (success) {
    Logger.success('草稿保存成功！');
  }

  Logger.success('草稿已保存');
}
```

### 6.8 日志系统

日志分级输出，支持配置日志级别：

```javascript
const Logger = {
  LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  currentLevel: 1, // 默认 INFO
  
  debug(msg) { if (this.currentLevel <= 0) console.debug(`[DEBUG] ${msg}`); },
  info(msg)  { if (this.currentLevel <= 1) console.info(`[INFO] ${msg}`); },
  warn(msg)  { if (this.currentLevel <= 2) console.warn(`[WARN] ${msg}`); },
  error(msg) { if (this.currentLevel <= 3) console.error(`[ERROR] ${msg}`); },
  
  step(num, msg) {
    console.log(`\n========== 步骤 ${num}: ${msg} ==========`);
  },
  
  result(success, msg) {
    const icon = success ? '✅' : '❌';
    console.log(`${icon} ${msg}`);
  },
};
```

---

## 七、错误处理机制

### 7.1 错误分类

| 错误类型 | 说明 | 处理策略 |
|---------|------|---------|
| 网络错误 | 页面加载失败、请求超时 | 重试3次，延长超时时间 |
| 元素未找到 | 选择器失效、页面结构变化 | 尝试备选选择器，记录日志 |
| 操作超时 | 对话框未出现、按钮不可点击 | 延长等待时间，截图记录 |
| 权限错误 | 登录态失效、无操作权限 | 提示用户重新登录 |
| 数据校验失败 | 表单验证不通过 | 检查输入数据，提示用户 |
| 并发冲突 | 脚本重复执行 | GM_setValue 分布式锁 |

### 7.2 重试策略

`TaskScheduler.execute()` 内置了重试逻辑，每个步骤失败后自动重试：

- 最大重试次数：`CONFIG.timing.maxRetries`（默认 3 次）
- 重试间隔：`CONFIG.timing.retryDelay`（默认 2000ms）
- 当前实现采用固定间隔重试（非指数退避），因为 OA 操作通常是即时性问题

### 7.3 锁超时保护

脚本使用 `oa_running` 标志防止并发执行。异常情况（如刷新页面、浏览器崩溃）可能导致锁未释放。解决方案：

- 记录 `oa_lock_time` 时间戳
- 每次 `main()` 执行前调用 `checkLockTimeout()` 检查
- 超过 `lockTimeout`（默认 120 秒）自动清除锁
- 未过期则显示剩余等待时间

```javascript
// 手动清除锁（应急）
GM_setValue('oa_running', false);
GM_setValue('oa_step', 0);
```

---

## 八、用户交互与配置

### 8.1 启动模式

脚本支持两种启动模式，由 `CONFIG.autoRun` 控制：

| 模式 | 配置值 | 触发方式 | 适用场景 |
|------|--------|---------|---------|
| 手动模式 | `autoRun: false`（默认） | Tampermonkey 菜单 → "立即执行创建周例会" | 日常使用，避免误触发 |
| 自动模式 | `autoRun: true` | 页面加载完成后自动执行 | 首次安装测试或定时任务 |

### 8.2 菜单命令

通过 `GM_registerMenuCommand` 注册以下菜单命令：

| 菜单命令 | 功能 |
|---------|------|
| 立即执行创建周例会 | 手动触发完整流程 |
| 查看执行状态 | 弹出当前运行状态和步骤编号 |

### 8.3 参会人员配置

当前参会人员硬编码在 `CONFIG.participants` 中，变更方式：

1. 打开 Tampermonkey → 编辑脚本
2. 修改 `CONFIG.participants` 数组
3. 保存（Ctrl+S）

每个人员条目包含 `name`（姓名）和 `uuid`（系统 UUID），例如：
```javascript
{ name: '戴科', uuid: 'e92eb9b1-975a-447a-b3c4-2e61b67d443d' }
```

如何获取 UUID：在 OA 人员选择对话框中，通过网络请求或 DOM 元素的 `data-uuid` 属性获取。

---

## 九、mini-ui 组件交互要点

OA 系统使用 mini-ui 框架（jQuery 类组件库），其组件交互有特殊注意事项：

| 组件类型 | 常见陷阱 | 正确操作方式 |
|---------|---------|-------------|
| Checkbox | 使用 CSS 模拟外观，`checked` 属性不可靠 | 点击内部的 `<input type="checkbox">` 真实元素 |
| 树形组件 | 渲染在 iframe 中，跨域可能无法访问 | 优先主文档查找，回退遍历 iframe |
| 对话框 | 动态生成 `_dialogId_` 和 `_winid` | 使用 class 或文本内容定位，不要依赖 ID |
| 表单输入 | 部分输入框为 mini-ui 封装组件 | 触发 `input` + `change` + `blur` 三个事件 |

---

## 十、实现路线图

| 阶段 | 内容 | 状态 | 备注 |
|------|------|------|------|
| Phase 1 | 技术验证 | ✅ 已完成 | v0.2.0 验证脚本，确认页面检测、元素定位、点击交互可行 |
| Phase 2 | 核心框架搭建 | ✅ 已完成 | 操作引擎 + 任务调度器 + 锁机制 |
| Phase 3 | 基础流程实现 | ✅ 已完成 | 步骤 1-4（导航到填写表单） |
| Phase 4 | 人员选择 | ✅ 已完成 | iframe 回退查找 + 树形组件勾选 |
| Phase 5 | 议题与保存 | ✅ 已完成 | 添加议题 + 保存草稿 + 结果验证 |
| Phase 6 | 配置与错误处理 | ✅ 已完成 | autoRun + 锁超时 + 重试 + 日志 |
| Phase 7 | 文档完善 | 🔧 进行中 | 实现方案、测试指南、验证指南 |
| Phase 8 | 测试与优化 | ⏳ 待执行 | 端到端测试 + 性能调优 |

---

## 十一、是否需要考虑浏览器插件

以下情况建议升级为 Chrome 插件：

- 需要后台定时执行（油猴脚本只在页面打开时运行）
- 需要拦截和修改网络请求（如直接调用 OA API）
- 需要跨域请求且目标服务器不支持 CORS
- 需要在多个页面间共享状态
- 需要更丰富的 UI（如 Tauri 弹窗、系统通知）

若以上需求在后续版本中出现，可在当前油猴脚本基础上扩展为插件，核心操作逻辑（BrowserEngine、Step 定义）可复用。
