/**
 * 新点OA周例会自动化 - 单元测试
 * 测试核心纯函数：ISO周数计算、会议名称生成
 */

// ==================== 从油猴脚本提取的纯函数 ====================

/**
 * 获取 ISO 8601 标准周数
 * @param {Date} date - 日期对象
 * @returns {number} ISO 周数
 */
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * 生成会议名称
 * @param {Date} date - 日期对象
 * @returns {string} 会议名称
 */
function generateMeetingName(date) {
  const CONFIG = {
    meeting: {
      nameTemplate: '研发4部-1组周例会-{year}年第{period}期-{mmdd}',
    },
  };
  const year = date.getFullYear();
  const period = getISOWeekNumber(date);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return CONFIG.meeting.nameTemplate
    .replace('{year}', year)
    .replace('{period}', period)
    .replace('{mmdd}', `${mm}${dd}`);
}

// ==================== 测试框架 ====================

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n========================================');
    console.log('新点OA周例会自动化 - 单元测试');
    console.log('========================================\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`✅ ${name}`);
      } catch (error) {
        this.failed++;
        this.errors.push({ name, error });
        console.log(`❌ ${name}`);
        console.log(`   错误: ${error.message}`);
      }
    }

    console.log('\n========================================');
    console.log(`测试结果: ${this.passed} 通过, ${this.failed} 失败`);
    console.log('========================================\n');

    if (this.failed > 0) {
      console.log('失败详情:');
      this.errors.forEach(({ name, error }) => {
        console.log(`  - ${name}: ${error.message}`);
      });
      process.exit(1);
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || '断言失败'}: 期望 "${expected}", 实际 "${actual}"`);
    }
  }

  assertTrue(value, message) {
    if (!value) {
      throw new Error(message || '断言失败: 期望为 true');
    }
  }

  assertFalse(value, message) {
    if (value) {
      throw new Error(message || '断言失败: 期望为 false');
    }
  }

  assertIncludes(str, substr, message) {
    if (!str.includes(substr)) {
      throw new Error(`${message || '断言失败'}: "${str}" 不包含 "${substr}"`);
    }
  }

  assertMatches(str, regex, message) {
    if (!regex.test(str)) {
      throw new Error(`${message || '断言失败'}: "${str}" 不匹配 ${regex}`);
    }
  }
}

// ==================== 测试用例 ====================

const runner = new TestRunner();

// ----- ISO 周数计算测试 -----

runner.test('ISO周数: 2026-01-01 应为第1周', () => {
  const date = new Date(2026, 0, 1);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 1, '2026-01-01 应为第1周');
});

runner.test('ISO周数: 2026-01-04 应为第1周（周四）', () => {
  const date = new Date(2026, 0, 4);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 1, '2026-01-04 应为第1周');
});

runner.test('ISO周数: 2026-09-17 应为第38周', () => {
  const date = new Date(2026, 8, 17);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 38, '2026-09-17 应为第38周');
});

runner.test('ISO周数: 2026-12-31 应为第53周（2026年最后一周）', () => {
  const date = new Date(2026, 11, 31);
  const week = getISOWeekNumber(date);
  // 2026-12-31 是周四，该周（12/28-1/3）包含 2026 年的周四，所以属于 2026 年第53周
  runner.assertEqual(week, 53, '2026-12-31 应为2026年第53周');
});

runner.test('ISO周数: 2024-12-30 应为第1周（2024年末）', () => {
  const date = new Date(2024, 11, 30);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 1, '2024-12-30 应为2025年第1周');
});

runner.test('ISO周数: 2026-06-15 应为第25周', () => {
  const date = new Date(2026, 5, 15);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 25, '2026-06-15 应为第25周');
});

runner.test('ISO周数: 2026-03-01 应为第9周', () => {
  const date = new Date(2026, 2, 1);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 9, '2026-03-01 应为第9周');
});

// ----- 会议名称生成测试 -----

runner.test('会议名称: 2026-09-17 格式正确', () => {
  const date = new Date(2026, 8, 17);
  const name = generateMeetingName(date);
  runner.assertEqual(name, '研发4部-1组周例会-2026年第38期-0917', '会议名称格式不正确');
});

runner.test('会议名称: 2026-01-01 年初格式正确', () => {
  const date = new Date(2026, 0, 1);
  const name = generateMeetingName(date);
  runner.assertIncludes(name, '2026年第1期', '年初应为第1期');
  runner.assertIncludes(name, '0101', '日期应为0101');
});

runner.test('会议名称: 2026-12-31 年末格式正确', () => {
  const date = new Date(2026, 11, 31);
  const name = generateMeetingName(date);
  runner.assertIncludes(name, '2026年', '应包含2026年');
  runner.assertIncludes(name, '1231', '日期应为1231');
});

runner.test('会议名称: 包含固定前缀', () => {
  const date = new Date(2026, 5, 15);
  const name = generateMeetingName(date);
  runner.assertIncludes(name, '研发4部-1组周例会', '应包含固定前缀');
});

runner.test('会议名称: 格式匹配正则', () => {
  const date = new Date(2026, 8, 17);
  const name = generateMeetingName(date);
  runner.assertMatches(name, /^研发4部-1组周例会-\d{4}年第\d+期-\d{4}$/, '会议名称应匹配格式');
});

runner.test('会议名称: 2026-06-15 完整验证', () => {
  const date = new Date(2026, 5, 15);
  const name = generateMeetingName(date);
  runner.assertEqual(name, '研发4部-1组周例会-2026年第25期-0615', '2026-06-15 会议名称不正确');
});

// ----- 边界测试 -----

runner.test('边界: 闰年2月29日', () => {
  const date = new Date(2024, 1, 29);
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 9, '2024-02-29 应为第9周');
});

runner.test('边界: 周一日期', () => {
  const date = new Date(2026, 8, 14); // 2026-09-14 是周一
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 38, '2026-09-14 应为第38周');
});

runner.test('边界: 周日日期', () => {
  const date = new Date(2026, 8, 20); // 2026-09-20 是周日
  const week = getISOWeekNumber(date);
  runner.assertEqual(week, 38, '2026-09-20 应为第38周');
});

// ==================== 运行测试 ====================

runner.run().then(() => {
  if (runner.failed === 0) {
    console.log('所有测试通过！');
    process.exit(0);
  } else {
    console.log(`${runner.failed} 个测试失败`);
    process.exit(1);
  }
});
