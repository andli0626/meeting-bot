// ==UserScript==
// @name         新点OA周例会自动化
// @namespace    http://tampermonkey.net/
// @version      1.6.1
// @description  自动创建部门周例会：填写会议信息、按姓名选择参会/列席人员、新增议题并保存草稿
// @author       CatPaw
// @match        https://oa.epoint.com.cn/epointoa9/frame/fui/pages/themes/aide/aide*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

/**
 * 使用与适配说明见同目录《使用说明.md》。
 *
 * 换团队/换环境时需要改的地方都集中在下面 CONFIG 里：
 * - urls.oaHome / @match：OA 地址（同一套 OA 无需修改）
 * - meeting.nameTemplate：会议名称格式（部门、组名）
 * - meeting.modelGuid / type：会议模板与会议类型
 * - meeting.period.base / baseDate：期次推算基准
 * - meeting.tencentMeeting：腾讯会议信息模板（线上会议时写入议题内容）
 * - participants：参会人员姓名
 * - participantGuids：姓名 → 人员 GUID（写入人员字段用；缺的姓名会尝试走人员弹窗解析）
 * - departedParticipants：已离职人员，人员离职时登记到这里（见下方更新日志 1.6.1）
 * - agenda.name / label：议题名称与议题标签（1=ST 2=AT 0=其他）
 *
 * 更新日志
 * - 1.6.1 人员离职处理：左惠已离职，从 participants / participantGuids 中移除；
 *         新增 CONFIG.departedParticipants，配置对话框里记住的历史名单也会自动剔除离职人员
 *         （否则 GM 存储里的旧名单会盖掉代码里的新名单，删了人还照样被写进会议）。
 * - 1.6.0 修复关键缺陷：草稿的会议日期/时间一直是"创建时刻"（表单默认值），
 *         现在会显式写入配置的会议日期与起止时间；配置对话框新增会议时间输入；
 *         "查看执行日志/状态"改为页面内可滚动面板（alert 会截断长日志）；
 *         新增"诊断会议表单"菜单（打开表单转储字段后关闭，不产生草稿）。
 * - 1.5.2 交互完善：执行成功后结果面板自动关闭（倒计时 10 秒，失败面板保留）；
 *         配置对话框防重复弹出、支持 ESC 取消；修复"注销登录"字样导致登录页误判。
 * - 1.5.1 关闭测试期间临时打开的自动执行（autoRun=false，改为菜单手动触发）。
 * - 1.5.0 人员字段写入改为"CONFIG 姓名 → GUID 映射"优先（已验证可用），
 *         映射里缺的姓名才去尝试打开人员弹窗解析；补齐了参会人员 GUID 配置项。
 * - 1.4.3 人员弹窗改为读取数据模型取 GUID；诊断信息瘦身，不再冲掉错误信息。
 * - 1.4.1 人员弹窗改多策略打开（点击/鼠标事件/mini 控件事件）。
 * - 1.4.0 人员选择改走 OA 人员弹窗（去掉写死的人员 GUID，换团队只改姓名）；
 *         配置记住上次填写内容；新增“清除运行锁/重置本地配置”菜单。
 * - 1.3.13 修复列席人员（无表决权）为空：回读弹窗写入值并同步到两个人员字段。
 * - 1.3.12 修复议题名称被议题编辑页异步回填覆盖：写入后回读校验并重写。
 */

(function () {
  "use strict";

  /** 脚本版本：取篡改猴记录的版本号，避免与文件头 @version 不一致 */
  const VERSION =
    (typeof GM_info !== "undefined" &&
      GM_info.script &&
      GM_info.script.version) ||
    "unknown";

  // ==================== 配置中心 ====================
  const CONFIG = {
    // 是否自动执行（页面加载完成后自动运行完整流程）
    // 设为 false 时，需通过 Tampermonkey 菜单手动触发
    autoRun: false,

    urls: {
      oaHome:
        "https://oa.epoint.com.cn/epointoa9/frame/fui/pages/themes/aide/aide?pageId=aide",
    },
    meeting: {
      nameTemplate: "研发4部-1组周例会-{year}年第{period}期-{mmdd}",
      type: "0203",
      modelGuid: "5fa25cb0-71a8-4086-b223-edd7e7e0cded",
      roomType: "online",
      // 会议期次：以 baseDate 为第 base 期，按周递增推算默认值，可在配置对话框中手动调整
      period: {
        base: 28,
        baseDate: "2026-09-17",
      },
      // 会议时间（写入表单的会议起止时间，格式 HH:mm-HH:mm，可在配置对话框中修改）
      time: "16:00-16:30",
      // 腾讯会议信息模板
      tencentMeeting: {
        topic: "周例会-研发1组",
        time: "16:00-17:00 (GMT+08:00) 中国标准时间 - 北京",
        url: "https://meeting.tencent.com/dm/RBOwS36hEUIX",
        id: "969-3173-9175",
        inviter: "李林-前端",
      },
    },
    // 参会人员姓名（配置对话框里填的就是这些姓名）
    participants: [
      "戴科",
      "黄赟博",
      "徐灵杰",
      "曹渝澄",
      "周胜宇",
      "杨世杰",
      "周志银",
      "杨赛",
    ],
    // 已离职人员：无论名单来自这里还是配置对话框里记住的历史名单，都会被自动剔除
    // 人员离职时只改 participants 不够——对话框保存过的旧名单存在 GM 存储里，会盖掉新名单，
    // 所以离职人员必须在这里登记一行（名字写法与 OA 通讯录一致）
    departedParticipants: ["左惠"],
    // 姓名 → 人员 GUID：写入人员字段时使用（OA 的隐藏域需要 GUID）
    // 缺哪个人就补哪一行；缺的姓名会退化为"打开人员选择弹窗解析"，可能解析不到
    participantGuids: {
      戴科: "e92eb9b1-975a-447a-b3c4-2e61b67d443d",
      黄赟博: "2894e5ad-241b-49de-bc2e-cd106f94675d",
      徐灵杰: "8dcd74d1-3609-4396-8c03-3a0513a64b5e",
      曹渝澄: "99d6612e-0a28-41c8-879a-187596b0534a",
      周胜宇: "22f13352-7505-4df3-86d9-53fc81e176c5",
      杨世杰: "bba2487c-03c2-4d02-ab78-cea80c43b7f6",
      周志银: "bec8b4ae-ab17-4f43-a840-dd8ecd744461",
      杨赛: "81b759d6-2441-4f7f-aa5b-3d63a5e65a73",
    },
    agenda: {
      // 议题名称默认值，可在配置对话框中修改
      name: "本周工作情况同步",
      label: 1,
      content: "本周工作情况同步",
    },
    selectors: {
      menuBtn: "#menu-btn",
      // 菜单中"统一会议"所在的 li（第二个 menu-block 中第一个 li）
      unifiedMeetingItem:
        'div.top-menu.menu-block li.top-menu-item[data-hassub="true"]',
      // "我的会议" tab（在点击"统一会议"展开的子菜单中）
      myMeetingTab: ".tabsnav-tabs-item",
      // 会议看板 iframe（动态生成，通过 src 特征识别）
      meetingBoardIframe: 'iframe[src*="meetingbasicinfoboard"]',
      // 表单 iframe（在 dialog 内部）
      formIframe: ".mini-panel-body iframe",
      // ===== 会议看板内按钮 =====
      addMeetingBtn: "#btnAdd",
      // ===== 表单内字段（使用 $text 后缀的 mini-ui 组件） =====
      meetingNameInput: '#meetingname\\.\\$text, input[id="meetingname$text"]',
      saveDraftBtn: "#btnSaveForm",
      saveMeetingBtn: "#btnSave",
      addAgendaBtn: "#btnAdd",
      selectUserTrigger: ".mini-buttonedit-trigger",
      // 会议室类型 radio（mini-11$ck$0 = 是, mini-11$ck$1 = 否）
      roomTypeYes: "#mini-11\\$ck\\$0",
      roomTypeNo: "#mini-11\\$ck\\$1",
    },
    timing: {
      stepTimeout: 15000,
      pollInterval: 300,
      maxRetries: 3,
      retryDelay: 2000,
      navigationTimeout: 30000,
      // oa_running 锁的超时时间（毫秒），防止刷新页面后永久锁死
      lockTimeout: 120000,
    },
  };

  // ==================== 日志系统 ====================
  const Logger = {
    prefix: "[OA-Weekly]",
    LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
    currentLevel: 1,
    // 最近日志环形缓冲，用于"查看执行日志"菜单快速排查
    history: [],

    record(level, msg) {
      const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      this.history.push(`[${time}][${level}] ${msg}`);
      if (this.history.length > 80) this.history.shift();
    },
    debug(msg) {
      if (this.currentLevel <= 0) {
        this.record("DEBUG", msg);
        console.debug(`${this.prefix} [DEBUG] ${msg}`);
      }
    },
    info(msg) {
      this.record("INFO", msg);
      if (this.currentLevel <= 1) console.info(`${this.prefix} ℹ️ ${msg}`);
    },
    warn(msg) {
      this.record("WARN", msg);
      if (this.currentLevel <= 2) console.warn(`${this.prefix} ⚠️ ${msg}`);
    },
    error(msg) {
      this.record("ERROR", msg);
      if (this.currentLevel <= 3) console.error(`${this.prefix} ❌ ${msg}`);
    },
    success(msg) {
      this.record("OK", msg);
      console.log(`${this.prefix} ✅ ${msg}`);
    },
    step(num, msg) {
      this.record("STEP", `步骤 ${num}: ${msg}`);
      console.log(`\n${this.prefix} 📍 步骤 ${num}: ${msg}`);
    },
    result(success, msg) {
      this.record(success ? "OK" : "ERROR", msg);
      console.log(`${this.prefix} ${success ? "✅" : "❌"} ${msg}`);
    },
  };

  // ==================== 交互式配置 ====================

  /**
   * 计算下一个周四的日期
   * 如果今天是周四，返回今天
   * @returns {Date} 下一个周四的日期
   */
  function getNextThursday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 4=周四
    const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
    const nextThursday = new Date(today);
    nextThursday.setDate(today.getDate() + daysUntilThursday);
    return nextThursday;
  }

  /**
   * 生成腾讯会议邀请文本
   * @param {Object} meeting - 会议配置中的 tencentMeeting
   * @returns {string} 格式化的邀请文本
   */
  function generateMeetingInviteText(meeting) {
    return `${meeting.inviter} 邀请您参加腾讯会议
会议主题：${meeting.topic}
会议时间：${meeting.time}
点击链接入会，或添加至会议列表：
${meeting.url}
#腾讯会议：${meeting.id}
复制该信息，打开手机腾讯会议即可参与`;
  }

  // ==================== 本地配置持久化 ====================

  /** 用户配置在篡改猴存储中的键名 */
  const STORAGE_KEY = "oa_weekly_user_config";

  /**
   * 读取上次保存的用户配置
   * @returns {Object} 用户配置，首次使用返回空对象
   */
  function loadUserConfig() {
    try {
      const raw = GM_getValue(STORAGE_KEY, "");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      Logger.debug(`读取本地配置失败: ${e.message}`);
      return {};
    }
  }

  /**
   * 保存用户配置，下次打开配置对话框自动带出
   * @param {Object} config - 需要持久化的配置
   */
  function saveUserConfig(config) {
    try {
      GM_setValue(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      Logger.warn(`保存本地配置失败: ${e.message}`);
    }
  }

  /**
   * 清除本地保存的用户配置（恢复脚本内置默认值）
   */
  function clearUserConfig() {
    GM_setValue(STORAGE_KEY, "");
    Logger.info("本地配置已清除，将使用脚本内置默认值");
  }

  /**
   * 剔除名单中的已离职人员
   * 配置对话框会把参会人员记进 GM 存储，人员离职后光改 CONFIG.participants 不够——
   * 对话框带出的是记住的旧名单。这里统一过滤，保证离职人员不会再被写进会议。
   * @param {string[]} names - 原始姓名列表
   * @param {string} source - 名单来源，仅用于日志说明
   * @returns {string[]} 过滤后的姓名列表
   */
  function dropDeparted(names, source) {
    const departed = (CONFIG.departedParticipants || []).map((n) =>
      String(n).trim(),
    );
    if (!departed.length || !Array.isArray(names)) return names;
    const removed = [];
    const kept = names.filter((name) => {
      const n = String(name).trim();
      if (departed.includes(n)) {
        removed.push(n);
        return false;
      }
      return true;
    });
    if (removed.length) {
      Logger.info(`${source}名单中已剔除离职人员: ${removed.join("、")}`);
    }
    return kept;
  }

  /**
   * HTML 转义：用户配置（腾讯会议信息、议题名称等）拼进对话框 innerHTML 前必须转义，
   * 否则内容里的 < > & " 会破坏对话框结构
   * @param {string} str - 原始文本
   * @returns {string} 转义后的文本
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 显示配置对话框，允许用户修改会议参数
   * @returns {Promise<Object|null>} 用户确认的配置，取消则返回 null
   */
  function showConfigDialog() {
    return new Promise((resolve) => {
      // 已有对话框打开时不再叠一个（连点菜单会触发两次）
      if (document.getElementById("oa-weekly-config-overlay")) {
        Logger.warn("配置对话框已打开，请先处理当前对话框");
        resolve(null);
        return;
      }

      // 上次填过的内容优先（议题、人员、会议形式、腾讯会议信息都会被记住）
      const saved = loadUserConfig();
      const isFirstRun = !saved.participantNames;
      const nextThurs = getNextThursday();
      const defaultName = generateMeetingName(nextThurs);
      const defaultPeriod = getDefaultPeriod(nextThurs);
      const defaultDateStr = nextThurs.toISOString().split("T")[0];
      const [defaultStartTime = "16:00", defaultEndTime = "16:30"] = (
        saved.meetingTime || CONFIG.meeting.time
      ).split(/\s*-\s*/);
      const inviteText =
        saved.meetingRoomInfo ||
        generateMeetingInviteText(CONFIG.meeting.tencentMeeting);
      const topicText = saved.topicName || CONFIG.agenda.name;
      const isOnline = saved.meetingType !== "offline";
      const participantText = dropDeparted(
        saved.participantNames && saved.participantNames.length
          ? saved.participantNames
          : CONFIG.participants,
        "参会人员",
      ).join("、");
      const safeInviteText = escapeHtml(inviteText);
      const safeTopicText = escapeHtml(topicText);
      const safeParticipantText = escapeHtml(participantText);
      const safeDefaultName = escapeHtml(defaultName);

      // 创建遮罩层
      const overlay = document.createElement("div");
      overlay.id = "oa-weekly-config-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;";

      // 创建对话框
      const dialog = document.createElement("div");
      dialog.style.cssText =
        "background:#fff;border-radius:12px;padding:24px;width:480px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);";

      dialog.innerHTML = `
        <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">📋 周例会配置确认</h2>
        ${
          isFirstRun
            ? `<div style="margin-bottom:12px;padding:8px 10px;background:#fffbe6;border:1px solid #ffe58f;border-radius:6px;font-size:12px;line-height:1.6;color:#874d00;">首次使用：请核对会议名称、参会人员、腾讯会议信息是否与你的团队一致。点"确认执行"后会记住这些设置，下次自动带出。</div>`
            : ""
        }
        <div style="margin-bottom:12px;display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">会议日期</label>
            <input type="date" id="cfg-date" value="${defaultDateStr}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          </div>
          <div style="width:120px;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">会议期次</label>
            <input type="number" id="cfg-period" min="1" value="${defaultPeriod}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          </div>
        </div>
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:flex-end;">
          <div>
            <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">开始时间</label>
            <input type="time" id="cfg-starttime" value="${defaultStartTime}" style="width:110px;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          </div>
          <div style="padding-bottom:10px;color:#999;">—</div>
          <div>
            <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">结束时间</label>
            <input type="time" id="cfg-endtime" value="${defaultEndTime}" style="width:110px;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">会议名称</label>
          <input type="text" id="cfg-name" value="${safeDefaultName}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">会议形式</label>
          <div style="display:flex;gap:8px;">
            <label style="flex:1;padding:10px;border:2px solid ${isOnline ? "#1890ff" : "#ddd"};border-radius:6px;text-align:center;cursor:pointer;background:${isOnline ? "#e6f7ff" : "transparent"};">
              <input type="radio" name="cfg-type" value="online" ${isOnline ? "checked" : ""} style="margin-right:4px;">线上会议
            </label>
            <label style="flex:1;padding:10px;border:2px solid ${isOnline ? "#ddd" : "#1890ff"};border-radius:6px;text-align:center;cursor:pointer;background:${isOnline ? "transparent" : "#e6f7ff"};">
              <input type="radio" name="cfg-type" value="offline" ${isOnline ? "" : "checked"} style="margin-right:4px;">线下会议
            </label>
          </div>
        </div>
        <div id="cfg-online-section" style="margin-bottom:12px;${isOnline ? "" : "display:none;"}">
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">腾讯会议信息</label>
          <textarea id="cfg-invite" rows="6" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;font-family:monospace;resize:none;">${safeInviteText}</textarea>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">议题名称</label>
          <input type="text" id="cfg-topic" value="${safeTopicText}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;">参会人员</label>
          <textarea id="cfg-participants" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:none;">${safeParticipantText}</textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button id="cfg-confirm" style="flex:1;padding:12px;background:#1890ff;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">确认执行</button>
          <button id="cfg-cancel" style="flex:1;padding:12px;background:#f5f5f5;color:#666;border:none;border-radius:6px;font-size:14px;cursor:pointer;">取消</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 会议形式切换逻辑
      const typeRadios = dialog.querySelectorAll('input[name="cfg-type"]');
      const onlineSection = dialog.querySelector("#cfg-online-section");
      typeRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.value === "online") {
            onlineSection.style.display = "block";
            typeRadios[0].parentElement.style.borderColor = "#1890ff";
            typeRadios[0].parentElement.style.background = "#e6f7ff";
            typeRadios[1].parentElement.style.borderColor = "#ddd";
            typeRadios[1].parentElement.style.background = "";
          } else {
            onlineSection.style.display = "none";
            typeRadios[1].parentElement.style.borderColor = "#1890ff";
            typeRadios[1].parentElement.style.background = "#e6f7ff";
            typeRadios[0].parentElement.style.borderColor = "#ddd";
            typeRadios[0].parentElement.style.background = "";
          }
        });
      });

      // 日期或期次变更时自动更新会议名称
      const dateInput = dialog.querySelector("#cfg-date");
      const nameInput = dialog.querySelector("#cfg-name");
      const periodInput = dialog.querySelector("#cfg-period");
      const refreshName = () => {
        nameInput.value = generateMeetingName(
          new Date(dateInput.value),
          periodInput.value,
        );
      };
      dateInput.addEventListener("change", () => {
        // 日期变更时，期次重置为按基准日期推算的默认值
        periodInput.value = getDefaultPeriod(new Date(dateInput.value));
        refreshName();
      });
      periodInput.addEventListener("input", refreshName);

      // 确认按钮
      dialog.querySelector("#cfg-confirm").addEventListener("click", () => {
        const name = nameInput.value.trim();
        const type = dialog.querySelector(
          'input[name="cfg-type"]:checked',
        ).value;
        const invite = dialog.querySelector("#cfg-invite").value;
        const participantsStr = dialog.querySelector("#cfg-participants").value;
        const topicName = dialog.querySelector("#cfg-topic").value.trim();
        const startTime = dialog.querySelector("#cfg-starttime").value;
        const endTime = dialog.querySelector("#cfg-endtime").value;
        const participantNames = dropDeparted(
          participantsStr
            .split(/[、,，;；\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          "参会人员",
        );

        // 必填校验：校验不通过时保留对话框，方便直接改
        if (!name) {
          alert("请填写会议名称");
          return;
        }
        if (!participantNames.length) {
          alert("请填写参会人员姓名（多人用、或逗号分隔）");
          return;
        }
        if (!startTime || !endTime) {
          alert("请填写会议的开始与结束时间");
          return;
        }
        if (endTime <= startTime) {
          alert("结束时间必须晚于开始时间");
          return;
        }
        const meetingTime = `${startTime}-${endTime}`;

        // 记住本次设置，下次打开自动带出
        saveUserConfig({
          topicName: topicName || CONFIG.agenda.name,
          participantNames: participantNames,
          meetingType: type,
          meetingRoomInfo: invite,
          meetingTime: meetingTime,
        });

        document.removeEventListener("keydown", onKeydown);
        document.body.removeChild(overlay);

        resolve({
          meetingName: name,
          meetingType: type,
          meetingRoomInfo: invite,
          meetingTime: meetingTime,
          meetingDate: dateInput.value,
          topicName: topicName || CONFIG.agenda.name,
          participantNames: participantNames,
        });
      });

      // 取消按钮
      const closeDialog = () => {
        document.removeEventListener("keydown", onKeydown);
        if (overlay.isConnected) document.body.removeChild(overlay);
        resolve(null);
      };
      const onKeydown = (e) => {
        if (e.key === "Escape") closeDialog();
      };
      document.addEventListener("keydown", onKeydown);
      dialog.querySelector("#cfg-cancel").addEventListener("click", closeDialog);
    });
  }

  // ==================== 工具函数 ====================

  /**
   * 计算默认会议期次
   * 以 CONFIG.meeting.period.baseDate 为第 base 期，之后每过一周期次 +1
   * @param {Date} date - 会议日期
   * @returns {number} 默认期次
   */
  function getDefaultPeriod(date) {
    const { base, baseDate } = CONFIG.meeting.period;
    const start = new Date(`${baseDate}T00:00:00`);
    const target = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffDays = Math.round((target - start) / 86400000);
    return base + Math.round(diffDays / 7);
  }

  /**
   * 生成会议名称
   * @param {Date} date - 日期对象
   * @param {number|string} [period] - 会议期次，缺省时按基准日期推算
   * @returns {string} 会议名称
   */
  function generateMeetingName(date, period) {
    const year = date.getFullYear();
    const finalPeriod =
      period === undefined || period === null || period === ""
        ? getDefaultPeriod(date)
        : period;
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return CONFIG.meeting.nameTemplate
      .replace("{year}", year)
      .replace("{period}", finalPeriod)
      .replace("{mmdd}", `${mm}${dd}`);
  }

  /**
   * 等待指定毫秒数
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  function waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== iframe 工具函数 ====================

  /**
   * 安全获取 iframe 的 document
   * @param {HTMLIFrameElement} iframe - iframe 元素
   * @returns {Document|null}
   */
  function getIframeDoc(iframe) {
    try {
      return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch (e) {
      Logger.debug(`iframe 访问失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 在 iframe 中查找元素（支持多级 iframe）
   * @param {HTMLIFrameElement} iframe - iframe 元素
   * @param {string} selector - CSS 选择器
   * @returns {Element|null}
   */
  function querySelectorInIframe(iframe, selector) {
    const doc = getIframeDoc(iframe);
    if (!doc) return null;
    return doc.querySelector(selector);
  }

  /**
   * 在 iframe 中通过 ID 获取元素
   * @param {HTMLIFrameElement} iframe - iframe 元素
   * @param {string} id - 元素 ID
   * @returns {Element|null}
   */
  function getElementByIdInIframe(iframe, id) {
    const doc = getIframeDoc(iframe);
    if (!doc) return null;
    try {
      return doc.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  /**
   * 在 iframe 中等待元素出现
   * @param {HTMLIFrameElement} iframe - iframe 元素
   * @param {string} selector - CSS 选择器
   * @param {number} timeout - 超时时间
   * @returns {Promise<Element|null>}
   */
  function waitForElementInIframe(iframe, selector, timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const existing = querySelectorInIframe(iframe, selector);
      if (existing) {
        resolve(existing);
        return;
      }
      const timer = setInterval(() => {
        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          Logger.error(`iframe 内元素超时: ${selector}`);
          resolve(null);
          return;
        }
        // 重新获取 iframe doc（iframe 可能已刷新）
        const doc = getIframeDoc(iframe);
        if (!doc) return;
        const el = doc.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        }
      }, 300);
    });
  }

  /**
   * 在 iframe 中点击元素
   * @param {HTMLIFrameElement} iframe - iframe 元素
   * @param {string} selector - CSS 选择器
   * @returns {boolean}
   */
  function clickInIframe(iframe, selector) {
    const el = querySelectorInIframe(iframe, selector);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.click();
    return true;
  }

  /**
   * 通过 src 特征查找 iframe
   * @param {Document} doc - 文档对象
   * @param {string} srcPattern - src 包含的字符串
   * @returns {HTMLIFrameElement|null}
   */
  function findFrameBySrc(doc, srcPattern) {
    const iframes = doc.querySelectorAll("iframe");
    for (const iframe of iframes) {
      if (iframe.src && iframe.src.includes(srcPattern)) {
        return iframe;
      }
    }
    return null;
  }

  /**
   * 通过 src 特征等待 iframe 出现
   * @param {string} srcPattern - src 包含的字符串
   * @param {number} timeout - 超时时间
   * @returns {Promise<HTMLIFrameElement|null>}
   */
  function waitForFrameBySrc(srcPattern, timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const existing = findFrameBySrc(document, srcPattern);
      if (existing) {
        resolve(existing);
        return;
      }
      const timer = setInterval(() => {
        const frame = findFrameBySrc(document, srcPattern);
        if (frame) {
          clearInterval(timer);
          resolve(frame);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          Logger.error(`等待 iframe 超时: src="${srcPattern}"`);
          resolve(null);
        }
      }, 300);
    });
  }

  /**
   * 递归收集当前页面所有可访问的文档（含多级 iframe）
   * @returns {Array<{doc: Document, path: string, src: string}>}
   */
  function collectAccessibleDocs() {
    const result = [];
    const walk = (doc, path, depth) => {
      if (!doc || depth > 6) return;
      result.push({ doc, path, src: doc.location?.href || "" });
      doc.querySelectorAll("iframe").forEach((frame, index) => {
        let subDoc = null;
        try {
          subDoc = getIframeDoc(frame);
        } catch (e) {
          subDoc = null;
        }
        if (subDoc) {
          walk(subDoc, `${path}>${index}`, depth + 1);
        }
      });
    };
    walk(document, "top", 0);
    return result;
  }

  /**
   * 在所有可访问文档中轮询查找元素
   * @param {Function} predicate - 接收 Document 返回 Element|null
   * @param {Object} options - { timeout, pollInterval }
   * @returns {Promise<{el: Element, doc: Document, path: string}|null>}
   */
  function waitForElementInAllDocs(predicate, options = {}) {
    const timeout = options.timeout || CONFIG.timing.stepTimeout;
    const pollInterval = options.pollInterval || CONFIG.timing.pollInterval;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const tryFind = () => {
        for (const { doc, path } of collectAccessibleDocs()) {
          try {
            const el = predicate(doc);
            if (el) return { el, doc, path };
          } catch (e) {
            // 单个文档查询失败不影响其他文档
          }
        }
        return null;
      };

      const existing = tryFind();
      if (existing) {
        resolve(existing);
        return;
      }

      const timer = setInterval(() => {
        const found = tryFind();
        if (found) {
          clearInterval(timer);
          resolve(found);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          resolve(null);
        }
      }, pollInterval);
    });
  }

  /**
   * 在所有可访问文档中按文本查找可点击元素（按钮/链接等）
   * @param {Array<string>} texts - 目标文本（精确匹配优先，其次包含匹配）
   * @param {Array<string>} tags - 参与匹配的标签名
   * @returns {{el: Element, doc: Document, path: string}|null}
   */
  function findClickableByTextInAllDocs(
    texts,
    tags = ["A", "BUTTON", "SPAN", "DIV", "INPUT"],
  ) {
    for (const { doc, path } of collectAccessibleDocs()) {
      let elements;
      try {
        elements = doc.querySelectorAll(tags.join(","));
      } catch (e) {
        continue;
      }
      // 精确匹配
      for (const el of elements) {
        const text = (el.textContent || el.value || "").trim();
        if (texts.includes(text)) {
          return { el, doc, path };
        }
      }
      // 包含匹配
      for (const el of elements) {
        const text = (el.textContent || el.value || "").trim();
        if (text && texts.some((t) => text === t || text.startsWith(t))) {
          return { el, doc, path };
        }
      }
    }
    return null;
  }

  /**
   * 在文档中查找 mini-ui 控件实例
   * @param {Document} doc - 文档
   * @param {string} name - 控件 id 或 name
   * @returns {Object|null} mini 控件实例
   */
  function findMiniControl(doc, name) {
    const win = doc && doc.defaultView;
    if (!win || !win.mini) return null;
    for (const getter of ["get", "getbyName", "getbyUid"]) {
      if (typeof win.mini[getter] !== "function") continue;
      try {
        const control = win.mini[getter](name);
        if (control) return control;
      } catch (e) {
        // 单个 getter 失败不影响后续尝试
      }
    }
    return null;
  }

  /**
   * 在文档中查找指定字段对应的真实输入框（含 mini 容器内部的 input）
   * @param {Document} doc - 文档
   * @param {string} name - 字段名
   * @returns {HTMLInputElement|HTMLTextAreaElement|null}
   */
  function findTextInputByName(doc, name) {
    if (!doc) return null;
    const candidates = [
      doc.getElementById(`${name}$text`),
      doc.getElementById(name),
      doc.querySelector(`[name="${name}"]`),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate.tagName === "INPUT" || candidate.tagName === "TEXTAREA") {
        return candidate;
      }
      // mini-ui 容器（span/div）内部才是真实输入框
      const inner = candidate.querySelector("input, textarea");
      if (inner) return inner;
    }
    return null;
  }

  /**
   * 读取 mini-ui 字段当前值
   * @param {Document} doc - 文档
   * @param {string} name - 字段名
   * @returns {string} 当前值
   */
  function readMiniFieldValue(doc, name) {
    const control = findMiniControl(doc, name);
    if (control && typeof control.getValue === "function") {
      try {
        const value = control.getValue();
        if (value !== undefined && value !== null && value !== "") {
          return String(value);
        }
      } catch (e) {
        // 忽略，继续用 DOM 读取
      }
    }
    const input = findTextInputByName(doc, name);
    return input ? String(input.value) : "";
  }

  /**
   * 设置 mini-ui 表单字段值（优先 mini 控件实例，回退真实输入框）
   * @param {Document} doc - 字段所在文档
   * @param {string} name - 字段名（如 topicname）
   * @param {string|number} value - 值
   * @returns {boolean} 是否设置成功
   */
  function setMiniFieldValue(doc, name, value) {
    const text = String(value);

    // 1. mini 控件实例（minii-ui 会以内部状态为准，直接写 DOM 可能被覆盖）
    const control = findMiniControl(doc, name);
    if (control && typeof control.setValue === "function") {
      try {
        control.setValue(text);
        if (typeof control.setText === "function") control.setText(text);
        if (readMiniFieldValue(doc, name) === text) return true;
      } catch (e) {
        Logger.debug(`mini 控件设置 ${name} 失败: ${e.message}`);
      }
    }

    // 2. 回退：真实输入框
    const input = findTextInputByName(doc, name);
    if (input) {
      return setInputValue(input, text);
    }
    return false;
  }

  /**
   * 稳定写入字段：写入后回读校验，被页面异步回填覆盖时自动重写
   *
   * 议题编辑页打开后会异步拉取数据并回填/重建表单控件，过早写入的字段会被覆盖为空
   * （实测"议题名称"最先写入，随后被回填清空）。这里连续两次读到目标值才认为写入稳定。
   *
   * @param {Function} resolveDoc - 每次调用返回字段当前所在文档（文档可能被重建）
   * @param {string} name - 字段名（如 topicname）
   * @param {string|number} value - 值
   * @param {Object} [options] - { attempts, intervalMs }
   * @returns {Promise<boolean>} 值是否最终稳定写入
   */
  async function setFieldValueStable(resolveDoc, name, value, options = {}) {
    const attempts = options.attempts || 8;
    const interval = options.intervalMs || 400;
    const text = String(value);
    let stableCount = 0;
    let lastRead = "";

    for (let i = 0; i < attempts; i++) {
      const doc = resolveDoc();
      if (doc) {
        lastRead = readMiniFieldValue(doc, name);
        if (lastRead === text) {
          stableCount++;
          // 连续两次读到目标值，说明未被页面回填覆盖
          if (stableCount >= 2) return true;
        } else {
          stableCount = 0;
          if (!setMiniFieldValue(doc, name, text)) {
            Logger.debug(`字段 ${name} 写入失败（第 ${i + 1} 次）`);
          }
        }
      }
      await waitFor(interval);
    }

    Logger.warn(`字段 ${name} 未稳定写入: 期望"${text}" 实际"${lastRead}"`);
    return false;
  }

  /**
   * 设置 mini-ui 控件值（优先 mini API，回退隐藏域 + 事件）
   * @param {Document} doc - 控件所在文档
   * @param {string} name - 控件 id/name（如 meetingshape）
   * @param {string} value - 值
   * @returns {boolean} 是否设置成功
   */
  function setMiniControlValue(doc, name, value) {
    const control = findMiniControl(doc, name);
    if (control && typeof control.setValue === "function") {
      try {
        control.setValue(value);
        return true;
      } catch (e) {
        Logger.debug(`mini 控件设置 ${name} 失败: ${e.message}`);
      }
    }

    // DOM 回退：直接写隐藏域并触发 change
    const hidden = doc.getElementById(`${name}$value`);
    if (hidden) {
      hidden.value = value;
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  /**
   * 读取人员选择型控件（mini-buttonedit）的原始值与显示文本
   *
   * 控件渲染结构：
   * <span id="seatnames" class="mini-buttonedit mini-buttonedit-noInput">
   *   <input id="seatnames$text" class="mini-buttonedit-input" readonly>
   *   <input id="seatnames$value" type="hidden">
   * </span>
   * - "#seatnames$text" 是只读显示框（姓名），"#seatnames$value" 才是提交用的值（人员 GUID 列表）
   * - 两者由 OA 人员选择弹窗写入，直接写 DOM 会被控件内部状态覆盖
   *
   * @param {Document} doc - 表单文档
   * @param {string} name - 控件 id（如 seatnames / usernames）
   * @returns {{value: string, text: string}} 原始值与显示文本
   */
  function readMiniButtonEditRaw(doc, name) {
    if (!doc) return { value: "", text: "" };
    const valueEl = doc.getElementById(`${name}$value`);
    const textEl = doc.getElementById(`${name}$text`);
    return {
      value: valueEl ? String(valueEl.value || "") : "",
      text: textEl ? String(textEl.value || "") : "",
    };
  }

  /**
   * 把人员选择结果原样写入另一个人员字段
   *
   * 值不做拆分重组，直接复用 OA 自己写入的分隔符，避免猜错格式。
   *
   * @param {Document} doc - 表单文档
   * @param {string} name - 目标控件 id
   * @param {string} rawValue - 原样复制的值（人员 GUID 列表）
   * @param {string} rawText - 原样复制的显示文本（姓名列表）
   * @returns {boolean} 是否写入成功
   */
  function setMiniButtonEditRaw(doc, name, rawValue, rawText) {
    if (!doc || !rawValue) return false;

    let applied = false;
    const control = findMiniControl(doc, name);
    if (control) {
      try {
        // value 与 text 必须都写，否则会出现"提交有值、界面显示为空"
        if (typeof control.setValue === "function") control.setValue(rawValue);
        if (typeof control.setText === "function") control.setText(rawText);
        applied = true;
      } catch (e) {
        Logger.debug(`mini 控件 ${name} 写值失败: ${e.message}`);
      }
    }

    // 兜底：直接写隐藏域（提交用）与只读显示框
    const valueInput = doc.getElementById(`${name}$value`);
    if (valueInput) {
      valueInput.value = rawValue;
      applied = true;
    }
    const textInput = doc.getElementById(`${name}$text`);
    if (textInput && rawText) setInputValue(textInput, rawText);

    return applied;
  }

  /**
   * 设置文本输入框的值并触发事件
   * @param {Element} el - 输入框
   * @param {string} value - 值
   * @returns {boolean} 是否设置成功
   */
  function setInputValue(el, value) {
    if (!el) return false;
    try {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    } catch (e) {
      Logger.debug(`设置输入框失败: ${e.message}`);
      return false;
    }
  }

  /**
   * 按表单标签文本定位字段所在行（.form-row）
   * 表单结构：<div class="form-row"><label class="form-label">参会人员（有表决权）：</label><div class="form-control">…</div></div>
   * @param {Document} doc - 表单文档
   * @param {string} labelPrefix - 标签文本前缀，如 "参会人员"
   * @param {Array<string>} [excludeKeywords] - 需要排除的标签关键词，如 ["列席"]
   * @returns {Element|null} 字段所在行元素
   */
  function findFormRowByLabel(doc, labelPrefix, excludeKeywords = []) {
    const labels = doc.querySelectorAll("label.form-label, .form-label, label");
    for (const label of labels) {
      const text = (label.textContent || "").replace(/\s+/g, "").trim();
      if (!text.startsWith(labelPrefix)) continue;
      if (excludeKeywords.some((k) => text.includes(k))) continue;
      return label.closest(".form-row") || label.parentElement;
    }
    return null;
  }

  /**
   * 输出文档内所有输入控件的关键信息（用于定位无法写入的字段）
   * @param {Document} doc - 文档
   * @param {string} tag - 标记
   */
  function dumpInputs(doc, tag) {
    if (!doc) return;
    const rows = [];
    doc.querySelectorAll("input, textarea").forEach((el) => {
      rows.push(
        `${el.tagName.toLowerCase()}#${el.id || "-"}.${(el.className || "-").split(" ")[0]}` +
          `${el.readOnly ? "(只读)" : ""}${el.disabled ? "(禁用)" : ""}=${String(el.value || "").slice(0, 10)}`,
      );
    });
    Logger.warn(`[${tag}] 输入控件 ${rows.length} 个:`);
    for (let i = 0; i < rows.length; i += 3) {
      Logger.warn(`  ${rows.slice(i, i + 3).join(" || ")}`);
    }
  }

  /**
   * 输出指定文档的元素 id 清单（用于定位真实字段）
   * @param {Document} doc - 文档
   * @param {string} tag - 标记
   */
  function dumpDocIds(doc, tag) {
    if (!doc) return;
    const ids = [];
    doc.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || /^mini-\d+/.test(id) || /^\d/.test(id)) return;
      const val = el.value ? `=${String(el.value).slice(0, 20)}` : "";
      ids.push(`${id}${val}`);
    });
    Logger.warn(`[${tag}] 元素 id 共 ${ids.length} 个:`);
    for (let i = 0; i < ids.length; i += 5) {
      Logger.warn(`  ${ids.slice(i, i + 5).join(" | ")}`);
    }
  }

  /**
   * 输出所有文档的结构诊断信息（用于选择器失效时定位真实 DOM）
   * @param {string} tag - 诊断场景标记
   */
  function dumpDocsDiagnostic(tag) {
    Logger.warn(`===== DOM 诊断 [${tag}] =====`);
    const rows = [];
    for (const { doc, path, src } of collectAccessibleDocs()) {
      let info = "";
      let relevant = false;
      try {
        const ids = [];
        doc.querySelectorAll("[id]").forEach((el) => {
          if (
            /topic|agenda|user|seat|name|tree|participant|select/i.test(el.id)
          ) {
            ids.push(el.id);
          }
        });
        const buttons = [];
        doc.querySelectorAll("a,button,input[type=button]").forEach((el) => {
          const t = (el.textContent || el.value || "").trim();
          if (t && t.length <= 12) buttons.push(t);
        });
        const treeNodes = doc.querySelectorAll(".mini-tree-nodetext").length;
        const trees = doc.querySelectorAll(".mini-tree").length;
        const addClose = doc.getElementById("addClose") ? 1 : 0;
        const topicname = doc.querySelectorAll('[id^="topicname"]').length;
        relevant =
          treeNodes > 0 ||
          trees > 0 ||
          addClose === 1 ||
          topicname > 0 ||
          ids.length > 0;
        info =
          `iframes=${doc.querySelectorAll("iframe").length}` +
          ` treeNodes=${treeNodes} trees=${trees} addClose=${addClose}` +
          ` topicname=${topicname}` +
          ` ids=[${ids.slice(0, 12).join(",")}]` +
          ` buttons=[${[...new Set(buttons)].slice(0, 10).join(",")}]`;
      } catch (e) {
        info = `读取失败: ${e.message}`;
      }
      const line = `  ${path} | ${src.slice(0, 70)} | ${info}`;
      // 只把"可能有线索"的文档打进日志面板，其余留在控制台，避免冲掉真正的错误信息
      if (relevant) {
        rows.push(line);
      } else {
        console.log(`${Logger.prefix} [DOM]${line}`);
      }
    }
    if (!rows.length) {
      Logger.warn("  没有含 id/人员树/议题字段的文档");
    }
    rows.slice(0, 6).forEach((line) => Logger.warn(line));
    if (rows.length > 6) {
      Logger.warn(`  …另有 ${rows.length - 6} 个文档，详见控制台`);
    }
    Logger.warn("===== DOM 诊断结束 =====");
  }

  /**
   * 等待指定元素出现（轮询机制）
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 配置项
   * @param {number} options.timeout - 超时时间
   * @param {number} options.pollInterval - 轮询间隔
   * @returns {Promise<Element|null>}
   */
  function waitForElement(selector, options = {}) {
    const timeout = options.timeout || CONFIG.timing.stepTimeout;
    const pollInterval = options.pollInterval || CONFIG.timing.pollInterval;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const existingElement = document.querySelector(selector);
      if (existingElement) {
        Logger.success(`元素已存在: ${selector}`);
        resolve(existingElement);
        return;
      }

      Logger.info(`等待元素出现: ${selector} (超时: ${timeout}ms)`);

      const timer = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          clearInterval(timer);
          Logger.success(`元素出现: ${selector}`);
          resolve(element);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          Logger.error(`等待元素超时: ${selector}`);
          resolve(null);
        }
      }, pollInterval);
    });
  }

  /**
   * 等待元素消失
   * @param {string} selector - CSS 选择器
   * @param {number} timeout - 超时时间
   * @returns {Promise<boolean>}
   */
  function waitForElementGone(selector, timeout = CONFIG.timing.stepTimeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const timer = setInterval(() => {
        const element = document.querySelector(selector);
        if (!element) {
          clearInterval(timer);
          Logger.success(`元素已消失: ${selector}`);
          resolve(true);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          Logger.error(`等待元素消失超时: ${selector}`);
          resolve(false);
        }
      }, CONFIG.timing.pollInterval);
    });
  }

  /**
   * 等待页面标题变化
   * @param {string} expectedTitle - 期望的标题
   * @param {number} timeout - 超时时间
   * @returns {Promise<boolean>}
   */
  function waitForTitle(expectedTitle, timeout = CONFIG.timing.stepTimeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      Logger.info(`等待标题变为: "${expectedTitle}"`);

      const timer = setInterval(() => {
        if (document.title.includes(expectedTitle)) {
          clearInterval(timer);
          Logger.success(`标题匹配成功: "${document.title}"`);
          resolve(true);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          Logger.error(`等待标题超时，当前标题: "${document.title}"`);
          resolve(false);
        }
      }, CONFIG.timing.pollInterval);
    });
  }

  /**
   * 安全点击元素
   * @param {Element} element - 要点击的元素
   * @returns {boolean} 是否点击成功
   */
  function safeClick(element) {
    if (!element) {
      Logger.error("点击失败: 元素不存在");
      return false;
    }
    try {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.click();
      const desc =
        element.tagName +
        (element.id ? "#" + element.id : "") +
        (element.className ? "." + element.className.split(" ")[0] : "");
      Logger.success(`点击成功: ${desc}`);
      return true;
    } catch (e) {
      Logger.error(`点击失败: ${e.message}`);
      return false;
    }
  }

  /**
   * 安全输入文本
   * @param {Element} element - 输入框元素
   * @param {string} text - 要输入的文本
   * @param {Object} options - 配置项
   * @returns {boolean} 是否输入成功
   */
  function safeInput(element, text, options = {}) {
    if (!element) {
      Logger.error("输入失败: 元素不存在");
      return false;
    }
    try {
      element.focus();
      if (options.clearFirst !== false) {
        element.value = "";
      }
      element.value = text;
      // 触发事件
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      Logger.success(`输入成功: "${text}"`);
      return true;
    } catch (e) {
      Logger.error(`输入失败: ${e.message}`);
      return false;
    }
  }

  /**
   * 检测页面是否在登录页
   *
   * 不能用 body 文本包含"登录"来判断：OA 首页顶栏有"注销登录"菜单项，
   * 文本匹配必然误报。改用结构特征：登录页有密码输入框，或 URL 指向登录地址。
   * @returns {boolean}
   */
  function isOnLoginPage() {
    if (document.querySelector('input[type="password"]')) return true;
    const href = location.href.toLowerCase();
    return href.includes("login") || href.includes("logon");
  }

  // ==================== 步骤实现 ====================

  /**
   * 步骤 0: 检查 oa_running 锁是否超时，防止刷新页面后永久锁死
   */
  function checkLockTimeout() {
    const running = GM_getValue("oa_running", false);
    if (!running) return;

    const lockTime = GM_getValue("oa_lock_time", 0);
    const now = Date.now();
    if (now - lockTime > CONFIG.timing.lockTimeout) {
      Logger.warn("检测到过期的执行锁，自动清理");
      GM_setValue("oa_running", false);
      GM_setValue("oa_step", 0);
    } else {
      const remaining = Math.ceil(
        (CONFIG.timing.lockTimeout - (now - lockTime)) / 1000,
      );
      Logger.warn(`脚本正在执行中（剩余约 ${remaining} 秒可重试）`);
    }
  }

  /**
   * 步骤 1: 验证页面加载和登录状态
   */
  async function step1_verifyPageLoad() {
    Logger.step(1, "验证页面加载和登录状态");

    if (isOnLoginPage()) {
      Logger.warn("当前在登录页，请先手动登录后再运行脚本");
      return false;
    }

    const titleValid = await waitForTitle("新点网上协同办公平台", 5000);
    if (!titleValid) {
      Logger.warn(`页面标题不匹配，当前标题: "${document.title}"`);
      return false;
    }

    Logger.success("页面加载验证通过");
    return true;
  }

  /**
   * 步骤 2: 打开会议看板
   * 根据录制数据分析：
   *   1. 先点击 #menu-btn 展开左侧菜单（菜单默认折叠）
   *   2. 在展开的菜单中点击 .modicon-1（我的会议图标）
   *   3. 页面导航到会议看板（标题变为"会议看板"）
   *   4. 等待 #btnAdd 按钮出现确认加载完成
   */
  async function step2_openMeetingBoard() {
    Logger.step(2, "打开会议看板");

    // 2.1 点击"统一会议"图标（.modicon-1 中 data-id="7816" 的那个）
    // ⚠️ 页面有多个 .modicon-1，第 1 个是"日志审核"，第 5 个才是"统一会议"
    // 正确选择器：li[data-id="7816"] .modicon-1
    const meetingLi = document.querySelector('li[data-id="7816"]');
    if (!meetingLi) {
      throw new Error('未找到"统一会议"菜单项');
    }
    const modicon = meetingLi.querySelector(".modicon-1");
    if (!modicon) {
      throw new Error('未找到"统一会议"图标');
    }
    safeClick(modicon);
    Logger.info('已点击"统一会议"图标');
    await waitFor(1500);

    // 2.2 在展开的子菜单中点击"我的会议" tab
    let myMeetingTab = null;
    const tabs = document.querySelectorAll(".tabsnav-tabs-item");
    for (const tab of tabs) {
      if (tab.textContent.trim() === "我的会议") {
        myMeetingTab = tab;
        break;
      }
    }

    if (!myMeetingTab) {
      throw new Error('未找到"我的会议" tab');
    }
    safeClick(myMeetingTab);
    Logger.info('已点击"我的会议" tab');
    await waitFor(2000);

    // 2.3 等待会议看板 iframe 出现
    const boardFrame = await waitForFrameBySrc("meetingbasicinfoboard", 10000);
    if (!boardFrame) {
      throw new Error("会议看板 iframe 加载超时");
    }

    // 验证 iframe 内容
    const boardDoc = getIframeDoc(boardFrame);
    if (!boardDoc || !boardDoc.querySelector("#btnAdd")) {
      throw new Error("会议看板加载不完整");
    }

    Logger.success("会议看板已打开");
    return true;
  }

  /**
   * 步骤 3: 点击新增会议按钮
   */
  /**
   * 获取表单 iframe（在会议看板 iframe 的 dialog 内）
   */
  function getFormFrame() {
    const boardFrame = findFrameBySrc(document, "meetingbasicinfoboard");
    if (!boardFrame) return null;
    const boardDoc = getIframeDoc(boardFrame);
    if (!boardDoc) return null;
    return boardDoc.querySelector(CONFIG.selectors.formIframe) || null;
  }

  /**
   * 步骤 3: 点击新增会议按钮（在会议看板 iframe 中）
   * → 打开 mini-dialog（内含表单 iframe）
   * → 等待表单 iframe 加载完成
   */
  async function step3_clickAddMeeting() {
    Logger.step(3, '点击"新增会议"按钮');

    const boardFrame = findFrameBySrc(document, "meetingbasicinfoboard");
    if (!boardFrame) {
      throw new Error("会议看板 iframe 不存在");
    }

    if (!clickInIframe(boardFrame, "#btnAdd")) {
      throw new Error('点击"新增会议"按钮失败');
    }
    Logger.info('已点击"新增会议"');
    await waitFor(2000);

    // 等待表单 iframe 加载完成（form iframe 中的 meetingname$text 出现）
    const formFrame = await waitForFormIframeLoad(10000);
    if (!formFrame) {
      throw new Error("表单 iframe 加载超时");
    }

    Logger.success("新增会议表单已加载");
    return true;
  }

  /**
   * 等待表单 iframe 加载（含 #meetingname$text）
   */
  async function waitForFormIframeLoad(timeout) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const frame = getFormFrame();
      if (frame) {
        const doc = getIframeDoc(frame);
        if (doc && doc.getElementById("meetingname$text")) {
          return frame;
        }
      }
      await waitFor(300);
    }
    return null;
  }

  /**
   * 步骤 4: 填写会议信息（先点会议室 checkbox，再填名称）
   *
   * SKILL.md 关键提示：
   * - 会议室类型使用 mini-ui 复合 checkbox 组件
   * - 点击"新增议题"前必须确保会议室复选框处于勾选状态，否则"会议形式验证失败"
   * - 最佳实践：document.querySelectorAll('input[type="checkbox"]')[0].click()
   */
  async function step4_fillMeetingInfo() {
    Logger.step(
      4,
      `填写会议信息（${runtimeConfig.meetingType === "online" ? "线上" : "线下"}）`,
    );

    const formFrame = getFormFrame();
    if (!formFrame) {
      throw new Error("表单 iframe 不存在");
    }

    const formDoc = getIframeDoc(formFrame);
    if (!formDoc) {
      throw new Error("无法访问表单文档");
    }

    // 4.1 设置会议形式
    // ⚠️ 页面的 add()/select() 会先执行 epoint.validate()，任一必填项不通过就直接 return，
    //    表现为"新增议题"点了没反应。会议形式（#meetingshape，checkboxlist）默认选中
    //    "线下会议室（公司）"(02)，此时"公司会议室"为必填且未选择 → 校验必然失败。
    //    线上会议应改为"线上会议室"(01)，并填写"其他会议室"（会议室链接）。
    const formWin = formFrame.contentWindow;
    if (runtimeConfig.meetingType === "online") {
      if (setMiniControlValue(formDoc, "meetingshape", "01")) {
        Logger.success("已设置会议形式: 线上会议室(01)");
      } else {
        Logger.warn("未找到会议形式控件 meetingshape");
      }
      await waitFor(800);

      const roomOtherInput = formDoc.getElementById("meetingroomother$text");
      if (roomOtherInput) {
        const { id, url } = CONFIG.meeting.tencentMeeting;
        const roomText = `腾讯会议 ${id} ${url}`;
        setInputValue(roomOtherInput, roomText);
        Logger.success(`已填写其他会议室: ${roomText}`);
      } else {
        Logger.warn("未找到其他会议室输入框");
      }

      // 确保会议形式的联动逻辑生效（隐藏"公司会议室"必填项等）
      try {
        if (formWin && typeof formWin.onMeetingshapeChanged === "function") {
          formWin.onMeetingshapeChanged({ value: "01" });
          Logger.info("已触发会议形式联动逻辑");
        }
      } catch (e) {
        Logger.debug(`会议形式联动调用失败: ${e.message}`);
      }
      const roomRow = findFormRowByLabel(formDoc, "公司会议室");
      const roomRowVisible = !!(roomRow && roomRow.offsetParent !== null);
      Logger.info(`公司会议室是否仍显示: ${roomRowVisible ? "是" : "否"}`);
    } else {
      if (setMiniControlValue(formDoc, "meetingshape", "02")) {
        Logger.info("已设置会议形式: 线下会议室（公司），公司会议室需人工选择");
      }
    }

    await waitFor(500);

    // 4.2 写入会议日期与起止时间
    // ⚠️ 表单把"会议时间"默认填成创建时刻（此前所有草稿都错在创建时间上），
    //    必须显式写入配置的会议日期与起止时间
    const meetingDate = runtimeConfig.meetingDate;
    const timeRange = (runtimeConfig.meetingTime || "").trim();
    if (meetingDate) {
      if (setMiniFieldValue(formDoc, "meetingdate", meetingDate)) {
        Logger.success(`已设置会议日期: ${meetingDate}`);
      } else {
        Logger.warn("未找到会议日期字段 meetingdate，转储表单字段排查");
        dumpDocIds(formDoc, "会议表单-日期字段");
      }
    }
    if (/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(timeRange)) {
      const [startTime, endTime] = timeRange.split(/\s*-\s*/);
      const timeCandidates = [
        ["meetingbegintime", startTime],
        ["meetingendtime", endTime],
        ["meetingstarttime", startTime],
        ["begintime", startTime],
        ["endtime", endTime],
        ["starttime", startTime],
      ];
      let setAnyTime = false;
      for (const [fieldName, value] of timeCandidates) {
        const exists =
          findMiniControl(formDoc, fieldName) ||
          findTextInputByName(formDoc, fieldName);
        if (!exists) continue;
        if (setMiniFieldValue(formDoc, fieldName, value)) {
          Logger.success(`已设置 ${fieldName}=${value}`);
          setAnyTime = true;
        }
      }
      if (!setAnyTime) {
        Logger.warn("未找到会议起止时间字段，转储表单字段排查");
        dumpDocIds(formDoc, "会议表单-时间字段");
      }
    }
    Logger.info(
      `会议日期回读: meetingdate="${readMiniFieldValue(formDoc, "meetingdate")}"`,
    );
    await waitFor(500);

    // 4.3 填写会议名称（使用用户在对话框中确认的名称）
    const meetingName = runtimeConfig.meetingName;

    if (formWin && formWin.mini) {
      try {
        const editor = formWin.mini.getbyName("meetingname");
        if (editor) {
          editor.setValue(meetingName);
          editor.setText(meetingName);
          Logger.success(`会议名称已填写（mini-ui）: ${meetingName}`);
          await waitFor(500);
          return true;
        }
      } catch (e) {
        Logger.debug(`mini API 失败: ${e.message}`);
      }
    }

    // 回退: DOM 操作
    const nameInput = formDoc.getElementById("meetingname$text");
    if (!nameInput) {
      throw new Error("未找到会议名称输入框");
    }
    nameInput.value = meetingName;
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    Logger.success(`会议名称已填写: ${meetingName}`);
    await waitFor(500);
    return true;
  }

  /**
   * 步骤 5: 选择参会/列席人员
   *
   * 实现方式（依据人员弹窗的真实结构）：
   * 1. 该会议模板会把"参会人员（有表决权）"(usernames) 置为 disabled，界面上可点的是
   *    "列席人员（无表决权）"(seatnames) 行的选择按钮，因此弹窗从 seatnames 行打开；
   * 2. 弹窗是 mini-tabstreeselect + grid 的复合控件（勾选框 id 形如 mini-6$checkbox$N），
   *    自动化里逐个点勾选框不稳定（会点到别的行、或把已勾选的点掉），因此只读取弹窗数据模型；
   * 3. 从数据模型取到"姓名 → 人员 GUID"后关闭弹窗，直接把 GUID 写入两个人员字段，
   *    不依赖任何写死的人员 GUID —— 换团队只需要改配置里的姓名。
   */
  async function step5_selectParticipants() {
    Logger.step(5, "选择参会人员");

    const formFrame = getFormFrame();
    if (!formFrame) {
      throw new Error("表单 iframe 不存在");
    }

    const formDoc = getIframeDoc(formFrame);
    if (!formDoc) {
      throw new Error("无法访问表单文档");
    }

    const attendRow = findFormRowByLabel(formDoc, "参会人员", ["列席"]);
    const seatRow = findFormRowByLabel(formDoc, "列席人员");
    if (!attendRow && !seatRow) {
      dumpDocsDiagnostic("step5-未找到人员字段行");
      throw new Error("未找到 参会人员（有表决权）/列席人员（无表决权） 字段");
    }

    const targetNames = runtimeConfig.participantNames
      .map((name) => String(name).trim())
      .filter(Boolean);
    if (!targetNames.length) {
      throw new Error("参会人员名单为空，请在配置对话框中填写姓名");
    }

    // 5.1 先取配置里的"姓名 → GUID"映射，缺失的姓名再尝试从人员弹窗解析
    const guidMap = new Map(
      Object.entries(CONFIG.participantGuids || {}).map(([name, guid]) => [
        String(name).trim(),
        String(guid).trim(),
      ]),
    );
    const missingNames = targetNames.filter((name) => !guidMap.get(name));
    if (missingNames.length) {
      Logger.info(
        `配置中缺少 ${missingNames.length} 位人员的 GUID，尝试从人员弹窗解析`,
      );
      const picked = await readUserGuidsFromPicker(
        seatRow || attendRow,
        targetNames,
      );
      picked.matched.forEach((name) =>
        guidMap.set(name, picked.idMap.get(name)),
      );
    }

    const matchedNames = targetNames.filter((name) => guidMap.get(name));
    const unresolvedNames = targetNames.filter((name) => !guidMap.get(name));
    if (!matchedNames.length) {
      throw new Error(
        "未取到任何参会人员的 GUID，请在脚本 CONFIG.participantGuids 中补全姓名对应的 GUID",
      );
    }
    if (unresolvedNames.length) {
      Logger.warn(
        `以下人员取不到 GUID，本次未写入: ${unresolvedNames.join("、")}` +
          "（可在 CONFIG.participantGuids 中补全）",
      );
    }

    // 5.2 写入两个人员字段：值 = GUID 列表（; 连接），显示文本 = 姓名列表（；连接）
    const rawValue = matchedNames.map((name) => guidMap.get(name)).join(";");
    const rawText = matchedNames.join("；");
    ["seatnames", "usernames"].forEach((field) => {
      if (setMiniButtonEditRaw(formDoc, field, rawValue, rawText)) {
        Logger.success(`已写入人员字段 ${field}（${matchedNames.length} 人）`);
      } else {
        Logger.warn(`写入人员字段 ${field} 失败`);
      }
    });

    await waitFor(800);

    // 5.3 回读确认
    const seatNow = readMiniButtonEditRaw(formDoc, "seatnames");
    const attendNow = readMiniButtonEditRaw(formDoc, "usernames");
    Logger.info(`列席人员（无表决权）当前值: ${seatNow.text || "(空)"}`);
    Logger.info(`参会人员（有表决权）当前值: ${attendNow.text || "(空)"}`);
    if (!seatNow.text || !attendNow.text) {
      Logger.warn("人员字段回读为空，请在草稿中核对参会/列席人员");
    }
    if (matchedNames.length < targetNames.length) {
      Logger.warn(
        `只写入 ${matchedNames.length}/${targetNames.length} 人，请在草稿中补齐`,
      );
    }

    return true;
  }

  /**
   * 在所有可访问文档中按 id 查找 mini 控件实例
   * @param {string} name - 控件 id
   * @returns {Object|null} mini 控件实例
   */
  function findMiniControlInAllDocs(name) {
    if (!name) return null;
    for (const { doc } of collectAccessibleDocs()) {
      const control = findMiniControl(doc, name);
      if (control) return control;
    }
    return null;
  }

  /**
   * 打开人员选择弹窗
   *
   * 同一种触发方式在部分模板/浏览器下可能不生效，因此依次尝试：
   * 点击选择按钮 → 派发鼠标事件 → 触发 mini 控件 buttonclick；
   * 每次尝试后短暂轮询人员树，出现即返回。
   *
   * @param {Element} rowEl - 人员字段所在行（优先 seatnames 行）
   * @returns {Promise<{el: Element, doc: Document, path: string}|null>} 人员树所在文档
   */
  async function openUserPicker(rowEl) {
    const buttonEdit = rowEl.querySelector(".mini-buttonedit");
    const control = buttonEdit ? findMiniControlInAllDocs(buttonEdit.id) : null;
    const getTrigger = () => rowEl.querySelector(".mini-buttonedit-trigger");

    const attempts = [
      {
        label: "点击选择按钮",
        run: () => {
          const el = getTrigger();
          if (!el) throw new Error("未找到 .mini-buttonedit-trigger");
          el.click();
        },
      },
      {
        label: "派发鼠标事件",
        run: () => {
          const el = getTrigger();
          if (!el) throw new Error("未找到 .mini-buttonedit-trigger");
          ["mousedown", "mouseup", "click"].forEach((type) => {
            el.dispatchEvent(
              new MouseEvent(type, { bubbles: true, cancelable: true }),
            );
          });
        },
      },
      {
        label: "触发 mini 控件 buttonclick",
        run: () => {
          if (!control || typeof control.fire !== "function") {
            throw new Error("未取到 mini 控件");
          }
          control.fire("buttonclick");
        },
      },
    ];

    for (const attempt of attempts) {
      try {
        attempt.run();
        Logger.info(`尝试打开人员选择弹窗: ${attempt.label}`);
      } catch (e) {
        Logger.warn(`打开人员选择弹窗失败(${attempt.label}): ${e.message}`);
        continue;
      }

      const found = await waitForElementInAllDocs(
        (doc) => {
          const nodes = doc.querySelectorAll(".mini-tree-nodetext");
          return nodes.length > 0 ? nodes[0] : null;
        },
        { timeout: 5000 },
      );
      if (found) {
        Logger.success(`人员选择弹窗已打开（${attempt.label}）`);
        return found;
      }
    }

    return null;
  }

  /**
   * 输出人员选择弹窗的结构摘要（诊断用，便于在日志面板里定位勾选问题）
   * @param {Document} doc - 弹窗文档
   */
  function logPickerStructure(doc) {
    const names = [...doc.querySelectorAll(".mini-tree-nodetext")]
      .map((n) => n.textContent.trim())
      .filter(Boolean);
    const boxes = doc.querySelectorAll('[id*="$checkbox$"]');
    Logger.warn(
      `人员弹窗结构: 姓名节点=${names.length} 去重后=${new Set(names).size}` +
        ` 勾选框=${boxes.length}`,
    );
  }

  /**
   * 打开人员弹窗 → 读取数据模型解析"姓名 → 人员 GUID" → 关闭弹窗
   * @param {Element} rowEl - 人员字段所在行（优先 seatnames 行）
   * @param {Array<string>} targetNames - 目标人员姓名
   * @returns {Promise<{idMap: Map<string,string>, matched: Array<string>}>} 姓名到 GUID 的映射与命中的姓名
   */
  async function readUserGuidsFromPicker(rowEl, targetNames) {
    const found = await openUserPicker(rowEl);
    if (!found) {
      dumpDocsDiagnostic("step5-人员树未出现");
      Logger.warn(
        "人员选择弹窗未打开（已依次尝试点击、鼠标事件、mini 控件事件），改用配置里的 GUID",
      );
      return { idMap: new Map(), matched: [] };
    }

    const pickerDoc = found.doc;
    Logger.success(`人员选择弹窗已加载（文档: ${found.path}）`);
    logPickerStructure(pickerDoc);

    const { items, keys, sample } = readPickerItems(pickerDoc);
    Logger.warn(
      `人员弹窗数据: 条数=${items.length} 字段=[${keys.join(",")}] 样例=${sample}`,
    );

    const idMap = new Map();
    const guidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    items.forEach((item) => {
      const entries = Object.entries(item).filter(
        ([, value]) => typeof value === "string" && value.trim(),
      );
      // 姓名：取与目标姓名完全一致的那个字段值
      const nameHit = entries.find(([, value]) =>
        targetNames.includes(value.trim()),
      );
      if (!nameHit) return;
      // GUID：优先取形如 GUID 的字段值，其次取字段名含 id/code/guid 的值
      const guidHit =
        entries.find(([, value]) => guidRe.test(value.trim())) ||
        entries.find(
          ([key, value]) =>
            /id|code|guid|uuid/i.test(key) &&
            /^[0-9a-z-]{6,}$/i.test(value.trim()),
        );
      if (guidHit) idMap.set(nameHit[1].trim(), guidHit[1].trim());
    });

    const matched = targetNames.filter((name) => idMap.has(name));
    Logger.info(
      `弹窗数据解析: 命中 ${matched.length}/${targetNames.length} 位人员`,
    );

    closeUserPicker(pickerDoc);
    return { idMap, matched };
  }

  /**
   * 读取人员弹窗数据控件里的数据项
   *
   * 弹窗里有两个控件：部门树（勾选框 id 形如 mini-6$checkbox$N，getData 只返回根节点）
   * 与用户列表 grid（单元格 id 形如 1$cell$1）。这里优先取 grid 的数据。
   *
   * @param {Document} doc - 弹窗文档
   * @returns {{items: Array<Object>, keys: Array<string>, sample: string}} 数据项、字段名与样例
   */
  function readPickerItems(doc) {
    const controlIds = [];
    const cellMarker = doc.querySelector('[id*="$cell$"]');
    if (cellMarker) controlIds.push(cellMarker.id.split("$cell$")[0]);
    const boxMarker = doc.querySelector('[id*="$checkbox$"]');
    if (boxMarker) controlIds.push(boxMarker.id.split("$checkbox$")[0]);

    let fallback = { items: [], keys: [], sample: "未取到数据控件" };
    for (const controlId of controlIds) {
      const control = controlId ? findMiniControl(doc, controlId) : null;
      if (!control || typeof control.getData !== "function") continue;

      let items = [];
      try {
        items = control.getData() || [];
      } catch (e) {
        fallback = {
          items: [],
          keys: [],
          sample: `getData 失败: ${e.message}`,
        };
        continue;
      }
      if (!items.length) continue;

      return {
        items,
        keys: Object.keys(items[0]).slice(0, 12),
        sample: JSON.stringify(items[0]).slice(0, 200),
      };
    }
    return fallback;
  }

  /**
   * 关闭人员选择弹窗（读取完数据即关闭，避免弹窗会话残留在页面上）
   * @param {Document} doc - 弹窗文档
   */
  function closeUserPicker(doc) {
    const closeBtn = doc.getElementById("addClose");
    if (closeBtn) {
      closeBtn.click();
      Logger.info("已关闭人员选择弹窗");
      return;
    }
    const byText = findClickableByTextInAllDocs(["取消", "关闭"]);
    if (byText) {
      byText.el.click();
      Logger.info("已关闭人员选择弹窗(文本按钮)");
    }
  }

  /**
   * 步骤 6: 新增议题
   *
   * SKILL.md 字段 ID：
   * - topicname = 议题名称
   * - topiclabel = 议题标签（1=ST议题，2=AT议题，0=其他议题）
   * - topiccontent = 议题内容
   */
  async function step6_addAgenda() {
    Logger.step(6, "新增议题");

    const formFrame = getFormFrame();
    if (!formFrame) {
      throw new Error("表单 iframe 不存在");
    }

    const formDoc = getIframeDoc(formFrame);
    if (!formDoc) {
      throw new Error("无法访问表单文档");
    }

    // 6.1 点击 formFrame 中的 "新增议题" (#btnAdd)
    const addBtn = formDoc.getElementById("btnAdd");
    if (!addBtn) {
      dumpDocsDiagnostic("step6-未找到新增议题按钮");
      throw new Error('未找到"新增议题"按钮');
    }
    addBtn.click();
    Logger.info('已点击"新增议题"');

    // 6.2 等待议题编辑对话框
    // 页面 add() 逻辑：先 epoint.validate()，不通过则直接 return（表现为点击无反应）；
    // 通过后 epoint.openDialog("会议议题-新增", "./meetingtopicinfoedit?...") 打开编辑页
    const topicFrameFound = await waitForElementInAllDocs(
      (doc) =>
        [...doc.querySelectorAll("iframe")].find((f) =>
          (f.src || "").includes("meetingtopicinfoedit"),
        ) || null,
      { timeout: 10000 },
    );

    if (!topicFrameFound) {
      dumpDocsDiagnostic("step6-议题对话框未打开");
      Logger.warn(
        "议题对话框未打开（通常说明表单必填项校验未通过，请检查会议形式/会议室等必填项）",
      );
      return true;
    }

    const topicDoc = getIframeDoc(topicFrameFound.el);
    if (!topicDoc) {
      throw new Error("无法访问议题对话框文档");
    }
    Logger.success(`议题对话框已打开（文档: ${topicFrameFound.path}）`);

    // 等待编辑页字段渲染完成
    const topicFound = await waitForElementInAllDocs(
      (doc) => doc.querySelector('[id^="topicname"]'),
      { timeout: 8000 },
    );
    if (!topicFound) {
      dumpDocsDiagnostic("step6-议题字段未出现");
      Logger.warn("未找到议题编辑字段，跳过议题填写");
      return true;
    }

    // 6.3 填写议题表单（字段位于议题编辑页文档内）
    // 议题编辑页会对表单做异步数据回填，每次读写都重新定位文档，避免持有被重建的旧文档
    const resolveTopicDoc = () => {
      const hit = collectAccessibleDocs().find(
        ({ doc }) =>
          doc.getElementById("topicname$text") ||
          doc.getElementById("topicname"),
      );
      return hit ? hit.doc : topicFound.doc;
    };
    // 议题名称取用户在配置对话框中的输入（默认"本周工作情况同步"），议题说明同名称
    const topicName = runtimeConfig.topicName || CONFIG.agenda.name;
    const agenda = { ...CONFIG.agenda, name: topicName, content: topicName };
    // 线上会议时，议题内容补充腾讯会议信息
    if (
      runtimeConfig.meetingType === "online" &&
      runtimeConfig.meetingRoomInfo
    ) {
      agenda.content += "\n\n" + runtimeConfig.meetingRoomInfo;
    }

    // 议题名称
    if (await setFieldValueStable(resolveTopicDoc, "topicname", agenda.name)) {
      Logger.success(`议题名称: ${agenda.name}`);
    } else {
      Logger.warn("议题名称填写失败");
    }

    // 议题标签（1=ST议题，2=AT议题，0=其他议题）
    if (
      agenda.label !== undefined &&
      (await setFieldValueStable(resolveTopicDoc, "topiclabel", agenda.label))
    ) {
      Logger.success(`议题标签: ${agenda.label}`);
    }

    // 议题内容
    if (
      await setFieldValueStable(resolveTopicDoc, "topiccontent", agenda.content)
    ) {
      Logger.success("议题内容已填写");
    } else {
      Logger.warn("未找到议题内容输入框");
    }

    await waitFor(500);

    // 6.3.1 保存前校验：议题编辑页的数据回填可能在首次写入之后才完成，
    // 被覆盖的字段（实测"议题名称"）在保存前重新写入
    const topicFields = [
      ["topicname", agenda.name],
      ["topiclabel", agenda.label],
      ["topiccontent", agenda.content],
    ];
    for (const [name, value] of topicFields) {
      if (value === undefined) continue;
      if (readMiniFieldValue(resolveTopicDoc(), name) === String(value))
        continue;
      Logger.warn(`字段 ${name} 被页面回填覆盖，重新写入`);
      await setFieldValueStable(resolveTopicDoc, name, value);
    }

    // 回填校验：读取议题各字段当前值，确认真正写入成功
    const readBack = (name) =>
      readMiniFieldValue(resolveTopicDoc(), name) || "(空)";
    Logger.info(
      `议题字段回填: topicname="${readBack("topicname")}" topiclabel="${readBack("topiclabel")}" topiccontent="${readBack("topiccontent")}"`,
    );

    // 议题名称未写入时输出该页面的输入控件与 mini 控件信息，便于定位真实字段
    if (readBack("topicname") === "(空)") {
      const topicFormDoc = resolveTopicDoc();
      const ctrl = findMiniControl(topicFormDoc, "topicname");
      Logger.warn(
        `topicname 控件查询结果: ${ctrl ? `type=${ctrl.type || ctrl.constructor?.name || "?"}` : "未找到"}`,
      );
      dumpInputs(topicFormDoc, "议题页");
    }

    // 6.4 保存议题：只在议题编辑页文档内查找保存按钮，避免误点会议表单的"保存/保存草稿"
    const topicFormDoc = resolveTopicDoc();
    const saveBtn =
      topicFormDoc.getElementById("btnSave") ||
      topicFormDoc.getElementById("btnSaveForm") ||
      topicFormDoc.querySelector('[id*="topic"][id*="save" i]');

    if (saveBtn) {
      saveBtn.click();
      Logger.success(
        `已点击保存议题: ${saveBtn.id || saveBtn.textContent.trim()}`,
      );
      await waitFor(1500);
      // 议题保存后可能出现确认弹窗（限制在 mini 弹窗内查找"确定"）
      const confirm = findClickableByTextInAllDocs(["确定", "是"]);
      const inDialog =
        confirm &&
        confirm.el.closest(
          '.mini-window, .mini-dialog, .mini-messagebox, [class*="dialog"], [class*="window"]',
        );
      if (confirm && inDialog) {
        confirm.el.click();
        Logger.success("已点击议题确认弹窗的确定");
      } else if (confirm) {
        Logger.info("检测到疑似确定按钮但不在弹窗内，已跳过点击");
      }
    } else {
      dumpDocsDiagnostic("step6-未找到保存议题按钮");
      Logger.warn("未找到保存议题按钮");
    }

    await waitFor(1000);
    return true;
  }

  /**
   * 步骤 7: 保存草稿
   * formFrame 中的 #btnSaveForm = "保存草稿"
   */
  async function step7_saveDraft() {
    Logger.step(7, "保存草稿");

    const formFrame = getFormFrame();
    if (!formFrame) {
      throw new Error("表单 iframe 不存在");
    }

    if (!clickInIframe(formFrame, "#btnSaveForm")) {
      throw new Error('点击"保存草稿"按钮失败');
    }

    Logger.info('已点击"保存草稿"');
    await waitFor(2000);

    Logger.success("草稿保存请求已发送");
    return true;
  }

  // ==================== 任务调度器 ====================
  const TaskScheduler = {
    steps: [],
    currentIndex: 0,

    addStep(name, fn) {
      this.steps.push({ name, fn });
    },

    async execute() {
      for (let i = 0; i < this.steps.length; i++) {
        this.currentIndex = i;
        const step = this.steps[i];
        GM_setValue("oa_step", i);

        let lastError = null;
        for (let attempt = 0; attempt <= CONFIG.timing.maxRetries; attempt++) {
          try {
            await step.fn();
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < CONFIG.timing.maxRetries) {
              Logger.warn(
                `步骤 "${step.name}" 第 ${attempt + 1} 次失败: ${error.message}，${CONFIG.timing.retryDelay}ms 后重试`,
              );
              await waitFor(CONFIG.timing.retryDelay);
            }
          }
        }

        if (lastError) {
          Logger.error(`步骤 "${step.name}" 最终失败: ${lastError.message}`);
          return {
            success: false,
            failedStep: step.name,
            error: lastError.message,
          };
        }
      }
      return { success: true };
    },
  };

  // ==================== 运行时配置（用户通过对话框修改） ====================
  let runtimeConfig = {
    meetingName: "",
    meetingType: "online",
    meetingRoomInfo: "",
    meetingDate: "",
    meetingTime: CONFIG.meeting.time,
    topicName: CONFIG.agenda.name,
    participantNames: [...CONFIG.participants],
  };

  // ==================== 主流程 ====================
  async function main() {
    Logger.info("========================================");
    Logger.info(`新点OA周例会自动化 v${VERSION} - 启动`);
    Logger.info("========================================");

    // 显示配置对话框，获取用户输入
    const userConfig = await showConfigDialog();
    if (!userConfig) {
      Logger.info("用户取消执行");
      return { success: false, error: "用户取消" };
    }

    // 更新运行时配置
    runtimeConfig = { ...runtimeConfig, ...userConfig };

    Logger.info("========================================");
    Logger.info("新点OA周例会自动化 - 开始执行");
    Logger.info("========================================");
    Logger.info(`执行时间: ${new Date().toLocaleString()}`);
    Logger.info(`会议名称: ${runtimeConfig.meetingName}`);
    Logger.info(
      `会议形式: ${runtimeConfig.meetingType === "online" ? "线上会议" : "线下会议"}`,
    );

    // 检查锁超时，清理过期锁
    checkLockTimeout();

    // 检查是否正在执行
    if (GM_getValue("oa_running", false)) {
      Logger.warn("脚本正在执行中，请勿重复触发");
      return { success: false, error: "脚本正在执行中" };
    }

    // 设置运行状态（记录锁时间用于超时检测）
    GM_setValue("oa_running", true);
    GM_setValue("oa_lock_time", Date.now());
    GM_setValue("oa_step", 0);

    try {
      // 注册步骤
      TaskScheduler.addStep("验证页面加载", step1_verifyPageLoad);
      TaskScheduler.addStep("打开会议看板", step2_openMeetingBoard);
      TaskScheduler.addStep("点击新增会议", step3_clickAddMeeting);
      TaskScheduler.addStep("填写会议信息", step4_fillMeetingInfo);
      TaskScheduler.addStep("选择参会人员", step5_selectParticipants);
      TaskScheduler.addStep("新增议题", step6_addAgenda);
      TaskScheduler.addStep("保存草稿", step7_saveDraft);

      // 执行
      const result = await TaskScheduler.execute();

      if (result.success) {
        Logger.info("========================================");
        Logger.success("周例会创建完成！");
        Logger.info("========================================");
        showResultPanel(true, `会议名称: ${runtimeConfig.meetingName}`);
      } else {
        Logger.error(`执行失败，失败步骤: ${result.failedStep}`);
        Logger.error(`错误信息: ${result.error}`);
        showResultPanel(
          false,
          `失败步骤: ${result.failedStep}，错误: ${result.error}`,
        );
      }

      return result;
    } catch (error) {
      Logger.error(`执行过程发生错误: ${error.message}`);
      Logger.error(error.stack);
      showResultPanel(false, `异常: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      GM_setValue("oa_running", false);
    }
  }

  /**
   * 渲染执行结果面板（无需打开 DevTools 即可查看执行情况）
   * @param {boolean} success - 是否成功
   * @param {string} summary - 结果摘要
   */
  function showResultPanel(success, summary) {
    const old = document.getElementById("oa-weekly-result-panel");
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.id = "oa-weekly-result-panel";
    panel.style.cssText =
      "position:fixed;right:16px;bottom:16px;width:460px;max-height:60vh;overflow:auto;z-index:99998;" +
      "background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.2);" +
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;padding:12px;";

    const title = document.createElement("div");
    title.style.cssText = `font-weight:600;margin-bottom:8px;color:${success ? "#237804" : "#cf1322"};`;
    title.textContent = `${success ? "执行成功" : "执行失败"} — ${summary}`;
    panel.appendChild(title);

    if (success) {
      const tip = document.createElement("div");
      tip.style.cssText = "margin-bottom:8px;color:#666;line-height:1.6;";
      tip.textContent =
        "已保存为草稿：请到「我的会议 → 会议列表（草稿）」核对会议名称、参会/列席人员与议题内容。";
      panel.appendChild(tip);
    }

    const list = document.createElement("div");
    list.style.cssText = "line-height:1.6;color:#333;white-space:pre-wrap;";
    // 最新日志在最上方，避免被面板高度截断
    list.textContent = Logger.history.slice(-25).reverse().join("\n");
    panel.appendChild(list);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "关闭";
    closeBtn.style.cssText =
      "margin-top:8px;padding:4px 12px;border:1px solid #ddd;background:#f5f5f5;border-radius:4px;cursor:pointer;";
    closeBtn.addEventListener("click", () => {
      if (autoCloseTimer) clearInterval(autoCloseTimer);
      panel.remove();
    });
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);

    // 成功时面板自动关闭（倒计时提示在关闭按钮上）；失败面板保留，便于排查
    let autoCloseTimer = null;
    if (success) {
      let remain = 10;
      autoCloseTimer = setInterval(() => {
        remain--;
        if (remain <= 0) {
          clearInterval(autoCloseTimer);
          if (panel.isConnected) panel.remove();
          return;
        }
        closeBtn.textContent = `关闭（${remain}s 后自动关闭）`;
      }, 1000);
      closeBtn.textContent = `关闭（${remain}s 后自动关闭）`;
    }
  }

  // ==================== 诊断与日志面板 ====================

  /**
   * 页面内可滚动的文本面板（alert 会在长文本时截断，且不可复制）
   * @param {string} title - 面板标题
   * @param {string[]} lines - 文本行，最新内容放在最后
   */
  function showTextPanel(title, lines) {
    const old = document.getElementById("oa-weekly-log-panel");
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.id = "oa-weekly-log-panel";
    panel.style.cssText =
      "position:fixed;top:60px;right:16px;width:520px;max-height:75vh;display:flex;flex-direction:column;z-index:99999;" +
      "background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.2);" +
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;padding:12px;";

    const header = document.createElement("div");
    header.style.cssText = "font-weight:600;margin-bottom:8px;color:#1a1a1a;";
    header.textContent = title;
    panel.appendChild(header);

    const pre = document.createElement("pre");
    pre.style.cssText =
      "margin:0;overflow:auto;max-height:60vh;white-space:pre-wrap;word-break:break-all;" +
      "line-height:1.6;color:#333;font-family:Menlo,Consolas,monospace;";
    pre.textContent = lines.join("\n");
    panel.appendChild(pre);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "关闭";
    closeBtn.style.cssText =
      "margin-top:8px;align-self:flex-end;padding:4px 16px;border:1px solid #ddd;background:#f5f5f5;border-radius:4px;cursor:pointer;";
    closeBtn.addEventListener("click", () => panel.remove());
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
    // 滚动到底部，最新内容可见
    pre.scrollTop = pre.scrollHeight;
  }

  /**
   * 关闭"新增会议"对话框（不保存草稿）
   */
  async function closeMeetingFormDialog() {
    const boardFrame = findFrameBySrc(document, "meetingbasicinfoboard");
    const boardDoc = boardFrame && getIframeDoc(boardFrame);
    if (boardDoc) {
      const closeBtn =
        boardDoc.querySelector(".mini-tools-close") ||
        boardDoc.querySelector(".mini-panel-header .mini-tools a:last-child");
      if (closeBtn) {
        closeBtn.click();
        Logger.info("已关闭新增会议对话框");
        await waitFor(1000);
        return;
      }
    }
    const byText = findClickableByTextInAllDocs(["取消", "关闭"]);
    if (byText) {
      byText.el.click();
      Logger.info(`已点击"${byText.text}"关闭对话框`);
      await waitFor(1000);
    } else {
      Logger.warn("未找到关闭按钮，请手动关闭新增会议对话框");
    }
  }

  /**
   * 诊断会议表单：打开"新增会议"对话框，转储全部字段与表单标签后关闭。
   * 不保存 → 不产生草稿，用于排查日期/时间等字段的控件名。
   */
  async function diagnoseMeetingForm() {
    Logger.info("===== 会议表单诊断开始 =====");
    try {
      const ok = await step1_verifyPageLoad();
      if (ok === false) return;
      await step2_openMeetingBoard();
      await step3_clickAddMeeting();
      const formFrame = getFormFrame();
      const formDoc = formFrame && getIframeDoc(formFrame);
      if (!formDoc) {
        Logger.warn("未能获取新增会议表单文档");
        return;
      }

      // 表单字段清单：控件 id + mini 控件类型 + 当前值
      const seen = new Set();
      const fields = [];
      formDoc.querySelectorAll("input[id]").forEach((el) => {
        const id = el.id.replace(/\$text$|\$value$/, "");
        if (!id || seen.has(id) || /^mini-\d+/.test(id)) return;
        seen.add(id);
        const ctrl = findMiniControl(formDoc, id);
        fields.push({
          id,
          type: ctrl
            ? ctrl.type || ctrl.constructor?.name || "mini"
            : "dom-input",
          value: String(el.value || "").slice(0, 30),
        });
      });
      Logger.info(`表单字段共 ${fields.length} 个:`);
      fields.forEach((f) =>
        Logger.info(`  ${f.id} [${f.type}] 当前值="${f.value}"`),
      );

      // 表单行标签清单（对照字段名与界面文案）
      const labels = [
        ...formDoc.querySelectorAll("label.form-label, .form-label, label"),
      ]
        .map((l) => (l.textContent || "").replace(/\s+/g, "").trim())
        .filter(Boolean);
      Logger.info(`表单标签: ${labels.join(" | ")}`);

      await closeMeetingFormDialog();
      Logger.info("===== 会议表单诊断结束 =====");
      showTextPanel("会议表单诊断结果", Logger.history);
    } catch (e) {
      Logger.error(`会议表单诊断失败: ${e.message}`);
      showTextPanel("会议表单诊断（失败）", Logger.history);
    }
  }

  // ==================== 注册菜单命令 ====================
  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("立即执行创建周例会", () => {
      main();
    });
    GM_registerMenuCommand("诊断会议表单（打开表单转储字段后关闭）", () => {
      diagnoseMeetingForm();
    });
    GM_registerMenuCommand("查看执行状态", () => {
      const running = GM_getValue("oa_running", false);
      const step = GM_getValue("oa_step", 0);
      showTextPanel("执行状态", [
        `运行状态: ${running ? "执行中" : "空闲"}`,
        `当前步骤: ${step}`,
      ]);
    });
    GM_registerMenuCommand("查看执行日志", () => {
      if (Logger.history.length === 0) {
        showTextPanel("执行日志", ["暂无执行日志"]);
        return;
      }
      showTextPanel(
        `最近执行日志（共 ${Logger.history.length} 条，最新在最下）`,
        Logger.history,
      );
    });
    GM_registerMenuCommand("清除运行锁（卡在“执行中”时用）", () => {
      GM_setValue("oa_running", false);
      GM_setValue("oa_step", 0);
      GM_setValue("oa_lock_time", 0);
      Logger.info("运行锁已清除");
      alert(
        "已清除运行锁，可以重新执行。\n仅用于脚本异常中断后一直提示“执行中”的情况。",
      );
    });
    GM_registerMenuCommand("重置本地配置（恢复内置默认值）", () => {
      clearUserConfig();
      alert("已重置本地配置，下次执行将使用脚本内置默认值。");
    });
  }

  // ==================== 启动 ====================
  if (CONFIG.autoRun) {
    // 自动执行模式：页面加载完成后自动运行完整流程
    if (document.readyState === "complete") {
      Logger.info("页面已加载完成，自动执行已启用，开始执行");
      main();
    } else {
      Logger.info("等待页面加载完成...");
      window.addEventListener("load", () => {
        Logger.info("页面加载完成，自动执行已启用，开始执行");
        main();
      });
    }
  } else {
    Logger.info(
      '自动执行已禁用，请通过 Tampermonkey 菜单手动触发"立即执行创建周例会"',
    );
  }
})();
