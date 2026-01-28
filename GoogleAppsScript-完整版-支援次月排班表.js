/**
 * 常順地產值班key進出系統 - Google Apps Script 完整版
 * 支援隨機平均排班功能 + 次月排班表
 * 
 * 📋 功能列表：
 * 1. 排班記錄管理（支援覆蓋模式 + 多工作表）
 * 2. 鑰匙借還記錄
 * 3. 鑰匙名稱清單
 * 4. 自動建立工作表
 * 5. 數據備份與恢復
 * 6. 支援「次月排班表」獨立工作表
 * 
 * 🔧 部署方式：請參考「GoogleAppsScript設定指南.md」
 */

// ==================== 配置區 ====================

const SHEET_NAMES = {
  SCHEDULE: '排班記錄',      // 一般排班記錄工作表
  NEXT_MONTH: '次月排班表',  // 次月排班表（隨機平均排班專用）
  KEYS: '鑰匙借還記錄',      // 鑰匙借還記錄工作表
  KEY_LIST: '鑰匙名稱清單',  // 鑰匙名稱清單工作表
  BACKUP: '資料備份'          // 備份工作表（可選）
};

// 成員資料對照表（與前端 MEMBERS 同步）
const MEMBERS_MAP = {
  '01': '以蓁',
  '02': '景翔',
  '03': '顯宗',
  '05': '莉羚',
  '06': '秋屏',
  '07': '林鋒',
  '08': '秀華',
  '09': '盈橙',
  '10': '大同',
  '11': '曉敏',
  '12': '雅婷',
  '13': '瑀嬅',
  '15': '皓宇',
  '16': '永樺',
  '17': '范沅',
  '18': '志桓',
  '19': '子菲',
  '20': '志偉',
  '21': '郁庭',
  '22': '婕茹',
  '23': '珈瑜',
  '25': '濬瑒',
  '26': '益呈',
  '90': '徐店東',
  '91': '簡副總',
  '92': '王店',
  '93': '曾經理',
  '94': '羅珍妮'
};

// 班別對照表
const SHIFT_LABELS = {
  'morning': '早班',
  'noon': '中班',
  'evening': '晚班'
};

// ==================== 主函數 ====================

/**
 * GET 請求處理（用於讀取數據）
 */
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;
  
  let result;
  
  try {
    switch(action) {
      case 'getSchedule':
        const yearMonth = e.parameter.yearMonth;
        const sheetName = e.parameter.sheetName || SHEET_NAMES.SCHEDULE;
        result = getSchedule(yearMonth, sheetName);
        break;
        
      case 'getKeys':
        result = getKeyRecords();
        break;
        
      case 'getKeyList':
        result = getKeyNameList();
        break;
        
      case 'testConnection':
        result = { status: 'success', message: '連線成功！' };
        break;
        
      default:
        result = { status: 'error', message: '未知的操作: ' + action };
    }
  } catch (error) {
    result = { 
      status: 'error', 
      message: error.toString(),
      stack: error.stack
    };
    Logger.log('錯誤: ' + error.toString());
  }
  
  // JSONP 響應（避免 CORS 問題）
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST 請求處理（用於寫入數據）
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const dataType = data.dataType;
    
    let result;
    
    switch(dataType) {
      case 'schedule':
        // 支援 targetSheet 參數（隨機平均排班會指定「次月排班表」）
        const targetSheet = data.targetSheet || SHEET_NAMES.SCHEDULE;
        Logger.log(`📋 接收到排班數據，目標工作表：${targetSheet}`);
        result = saveSchedule(data, targetSheet);
        break;
        
      case 'singleUpdate':
        // 單筆更新（換班專用）
        result = updateSingleSchedule(data);
        break;
        
      case 'key':
        result = saveKeyRecord(data);
        break;
        
      case 'addKeyName':
        // 新增鑰匙名稱
        result = addKeyName(data);
        break;
        
      case 'keyName':
        // ⭐ 向下兼容舊版（舊版使用 'keyName' 作為 dataType）
        Logger.log('⚠️ 檢測到舊版 dataType: keyName，轉換為新版格式');
        result = saveKeyName(data);
        break;
        
      default:
        result = { status: 'error', message: '未知的數據類型: ' + dataType };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('POST 錯誤: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== 排班記錄相關 ====================

/**
 * 讀取排班記錄
 * @param {string} yearMonth - 年月（格式：2025-10），null 表示讀取所有
 * @param {string} sheetName - 工作表名稱（默認為「排班記錄」）
 * @return {object} 排班數據
 */
function getSchedule(yearMonth, sheetName = SHEET_NAMES.SCHEDULE) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log(`📥 開始讀取排班：工作表「${sheetName}」，年月：${yearMonth || '全部'}`);
  Logger.log(`📊 Sheets ID: ${ss.getId()}`);
  Logger.log(`📊 Sheets 名稱: ${ss.getName()}`);
  
  let sheet = ss.getSheetByName(sheetName);
  
  // 如果工作表不存在，自動建立
  if (!sheet) {
    Logger.log(`⚠️ 工作表「${sheetName}」不存在，正在自動建立...`);
    sheet = createScheduleSheet(sheetName);
    return {
      status: 'success',
      recordCount: 0,
      data: {},
      message: `已自動建立「${sheetName}」工作表`
    };
  }
  
  const data = sheet.getDataRange().getValues();
  Logger.log(`📊 工作表總行數: ${data.length}`);
  
  // 檢查是否有數據
  if (data.length <= 1) {
    return {
      status: 'success',
      recordCount: 0,
      data: {},
      message: '工作表中沒有排班記錄'
    };
  }
  
  // 讀取表頭
  const headers = data[0];
  Logger.log('表頭: ' + JSON.stringify(headers));
  
  // 預期格式：時間戳記 | 年月 | 排班類型 | 日期 | 班別 | 成員ID | 成員姓名 | 班別時段
  // 列索引：    0       1      2        3      4      5        6         7
  
  const scheduleMap = {};
  let processedRows = 0;
  let skippedRows = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // 檢查必要欄位
    if (!row[1] || !row[3] || !row[4] || !row[5]) {
      skippedRows++;
      continue;
    }
    
    const rowYearMonth = String(row[1]).trim();  // 年月
    const rowDate = String(row[3]).trim();       // 日期
    const rowShift = String(row[4]).trim();      // 班別
    let memberId = String(row[5]).trim();        // 成員ID
    
    // 補零處理（1 -> 01）
    if (memberId.length === 1 && !isNaN(memberId)) {
      memberId = memberId.padStart(2, '0');
    }
    
    // 如果指定了年月，只返回該月份的記錄
    if (!yearMonth || rowYearMonth === yearMonth) {
      // 將中文班別轉換為英文 key
      let shiftKey = rowShift;
      if (rowShift.includes('早')) shiftKey = 'morning';
      else if (rowShift.includes('中')) shiftKey = 'noon';
      else if (rowShift.includes('晚') || rowShift.includes('夜')) shiftKey = 'evening';
      
      // 格式：2025-10:1-morning
      const key = `${rowYearMonth}:${rowDate}-${shiftKey}`;
      scheduleMap[key] = memberId;
      processedRows++;
    }
  }
  
  Logger.log(`讀取完成: 處理 ${processedRows} 筆，跳過 ${skippedRows} 筆`);
  
  return {
    status: 'success',
    recordCount: processedRows,
    data: scheduleMap,
    sheetName: sheetName
  };
}

/**
 * 儲存排班記錄
 * @param {object} data - 排班數據
 * @param {string} targetSheet - 目標工作表名稱
 * @return {object} 執行結果
 */
function saveSchedule(data, targetSheet = SHEET_NAMES.SCHEDULE) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(targetSheet);
  
  // 如果工作表不存在，自動建立
  if (!sheet) {
    sheet = createScheduleSheet(targetSheet);
    Logger.log(`✅ 已自動建立工作表「${targetSheet}」`);
  }
  
  const yearMonth = data.yearMonth;
  const scheduleType = data.scheduleType || '手動排班';
  const scheduleData = data.scheduleData;
  const members = data.members || MEMBERS_MAP;
  const action = data.action || 'append';
  
  Logger.log(`開始儲存排班到「${targetSheet}」: ${yearMonth}, 類型: ${scheduleType}, 模式: ${action}`);
  Logger.log(`資料筆數: ${Object.keys(scheduleData).length}`);
  
  // 如果是更新模式（隨機平均排班），先刪除該月份的舊數據
  if (action === 'update') {
    const allData = sheet.getDataRange().getValues();
    let deletedCount = 0;
    
    // 從最後一行往前刪除（避免索引錯亂）
    for (let i = allData.length - 1; i >= 1; i--) {
      if (allData[i][1] === yearMonth) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    
    Logger.log(`已刪除「${targetSheet}」中的舊資料: ${deletedCount} 筆`);
  }
  
  // 準備新數據
  const newRows = [];
  const timestamp = new Date().toISOString();
  
  // 轉換數據格式
  // scheduleData 格式：{ "2025-10:1-morning": "01", ... }
  Object.keys(scheduleData).forEach(key => {
    const parts = key.split(':');
    const ym = parts[0];
    const datePart = parts[1];
    
    // 解析日期和班別
    const dashIndex = datePart.lastIndexOf('-');
    const date = datePart.substring(0, dashIndex);
    const shiftKey = datePart.substring(dashIndex + 1);
    
    // 只處理當前月份的數據
    if (ym === yearMonth) {
      const memberId = scheduleData[key];
      const memberName = members[memberId] || getMemberNameById(memberId);
      const shiftLabel = SHIFT_LABELS[shiftKey] || shiftKey;
      
      // 判斷時段
      let timeSlot = '';
      const dateNum = parseInt(date);
      const dateObj = new Date(`${yearMonth}-${String(dateNum).padStart(2, '0')}`);
      const weekday = dateObj.getDay();
      const isWeekend = (weekday === 0 || weekday === 6);
      
      if (isWeekend) {
        if (shiftKey === 'morning') timeSlot = '09:30-13:30';
        else if (shiftKey === 'noon') timeSlot = '13:30-17:30';
        else if (shiftKey === 'evening') timeSlot = '17:30-21:00';
      } else {
        if (shiftKey === 'morning') timeSlot = '09:30-15:30';
        else if (shiftKey === 'evening') timeSlot = '15:30-21:00';
      }
      
      newRows.push([
        timestamp,      // 時間戳記
        yearMonth,      // 年月
        scheduleType,   // 排班類型
        date,           // 日期
        shiftLabel,     // 班別
        memberId,       // 成員ID
        memberName,     // 成員姓名
        timeSlot        // 班別時段
      ]);
    }
  });
  
  // 批次寫入（效能優化）
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows);
    Logger.log(`✅ 成功寫入 ${newRows.length} 筆排班記錄到「${targetSheet}」`);
  }
  
  return { 
    status: 'success', 
    message: `排班數據已保存到「${targetSheet}」（${newRows.length} 筆）`,
    recordCount: newRows.length,
    targetSheet: targetSheet
  };
}

/**
 * 更新單筆排班記錄（換班專用）
 * @param {object} data - 單筆排班數據
 * @return {object} 執行結果
 */
function updateSingleSchedule(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = data.targetSheet || SHEET_NAMES.SCHEDULE;
  let sheet = ss.getSheetByName(targetSheet);
  
  if (!sheet) {
    sheet = createScheduleSheet(targetSheet);
  }
  
  const yearMonth = data.yearMonth;
  const day = data.day;
  const shiftKey = data.shiftKey;
  const memberId = data.memberId;
  const memberName = data.memberName;
  const shiftTime = data.shiftTime;
  
  Logger.log(`單筆更新到「${targetSheet}」: ${yearMonth} 日期${day} ${shiftKey} → ${memberName}(${memberId})`);
  
  // 查找是否已有相同的記錄
  const allData = sheet.getDataRange().getValues();
  let rowFound = false;
  
  // 從第2行開始查找（第1行是表頭）
  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    
    // 檢查是否為同一筆記錄（年月、日期、班別都相同）
    if (row[1] == yearMonth && row[3] == day && row[4] == SHIFT_LABELS[shiftKey]) {
      // 更新這一筆記錄
      const rowNum = i + 1;
      sheet.getRange(rowNum, 1).setValue(new Date().toISOString()); // 更新時間戳記
      sheet.getRange(rowNum, 6).setValue(memberId);                 // 更新成員ID
      sheet.getRange(rowNum, 7).setValue(memberName);               // 更新成員姓名
      
      Logger.log(`✅ 已更新第 ${rowNum} 行的記錄`);
      rowFound = true;
      break;
    }
  }
  
  // 如果找不到記錄，新增一筆
  if (!rowFound) {
    const shiftLabel = SHIFT_LABELS[shiftKey] || shiftKey;
    
    sheet.appendRow([
      new Date().toISOString(), // 時間戳記
      yearMonth,                // 年月
      '手動換班',               // 排班類型
      day,                      // 日期
      shiftLabel,               // 班別
      memberId,                 // 成員ID
      memberName,               // 成員姓名
      shiftTime                 // 班別時段
    ]);
    
    Logger.log(`✅ 已新增一筆記錄`);
  }
  
  return {
    status: 'success',
    message: rowFound ? '排班記錄已更新' : '排班記錄已新增',
    targetSheet: targetSheet
  };
}

/**
 * 建立排班記錄工作表
 * @param {string} sheetName - 工作表名稱
 */
function createScheduleSheet(sheetName = SHEET_NAMES.SCHEDULE) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet(sheetName);
  
  // 設定表頭
  const headers = ['時間戳記', '年月', '排班類型', '日期', '班別', '成員ID', '成員姓名', '班別時段'];
  sheet.appendRow(headers);
  
  // 格式化表頭
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  
  // 根據不同工作表使用不同顏色
  if (sheetName === SHEET_NAMES.NEXT_MONTH) {
    headerRange.setBackground('#e91e63');  // 粉紅色 - 次月排班表
  } else {
    headerRange.setBackground('#4a86e8');  // 藍色 - 一般排班記錄
  }
  
  headerRange.setFontColor('#ffffff');
  
  // 凍結表頭
  sheet.setFrozenRows(1);
  
  // 設定欄寬
  sheet.setColumnWidth(1, 180); // 時間戳記
  sheet.setColumnWidth(2, 80);  // 年月
  sheet.setColumnWidth(3, 100); // 排班類型
  sheet.setColumnWidth(4, 60);  // 日期
  sheet.setColumnWidth(5, 80);  // 班別
  sheet.setColumnWidth(6, 80);  // 成員ID
  sheet.setColumnWidth(7, 100); // 成員姓名
  sheet.setColumnWidth(8, 120); // 班別時段
  
  Logger.log(`已建立「${sheetName}」工作表`);
  
  return sheet;
}

// ==================== 鑰匙借還記錄相關 ====================

/**
 * 讀取鑰匙借還記錄
 */
function getKeyRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.KEYS);
  
  if (!sheet) {
    sheet = createKeysSheet();
    return {
      status: 'success',
      recordCount: 0,
      data: []
    };
  }
  
  const data = sheet.getDataRange().getValues();
  const records = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    records.push({
      id: row[0],
      borrowTime: row[1],
      borrowerType: row[2],
      borrowerId: row[3],
      borrowerName: row[4],
      borrowerPhone: row[5],
      keyItem: row[6],
      status: row[7],
      returnTime: row[8] || null,
      dutyConfirmedBy: row[9] || null,
      dutyConfirmedTime: row[10] || null
    });
  }
  
  return {
    status: 'success',
    recordCount: records.length,
    data: records
  };
}

/**
 * 儲存鑰匙借還記錄
 */
function saveKeyRecord(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.KEYS);
  
  if (!sheet) {
    sheet = createKeysSheet();
  }
  
  const action = data.action;
  const record = data.record;
  
  // 處理電話號碼（保持文字格式）
  const phone = record.colleaguePhoneForSheets || record.colleaguePhone || '';
  
  if (action === 'borrow') {
    // 新增借出記錄
    const newRow = sheet.getLastRow() + 1;
    
    // 先設定電話欄位為文字格式
    sheet.getRange(newRow, 6).setNumberFormat('@STRING@');
    
    // 寫入資料
    sheet.appendRow([
      record.id,
      record.borrowTime,
      record.borrowerType === 'member' ? '成員' : '同業',
      record.memberId || '',
      record.borrowerType === 'member' ? record.memberName : record.colleagueName,
      phone,
      record.keyItem,
      '借出中',
      '',
      '',
      ''
    ]);
    
    // 確保電話格式正確
    if (phone) {
      const phoneCell = sheet.getRange(newRow, 6);
      phoneCell.setNumberFormat('@STRING@');
      const cleanPhone = phone.startsWith("'") ? phone.substring(1) : phone;
      phoneCell.setValue(cleanPhone);
    }
    
    return { status: 'success', message: '借出記錄已保存' };
    
  } else if (action === 'return' || action === 'confirm') {
    // 更新歸還或確認記錄
    const allData = sheet.getDataRange().getValues();
    
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] == record.id) {
        const rowNum = i + 1;
        
        if (action === 'return') {
          sheet.getRange(rowNum, 8).setValue('已歸還');
          sheet.getRange(rowNum, 9).setValue(record.returnTime || new Date().toISOString());
        } else if (action === 'confirm') {
          sheet.getRange(rowNum, 10).setValue(record.dutyConfirmedBy);
          sheet.getRange(rowNum, 11).setValue(record.dutyConfirmedTime || new Date().toISOString());
        }
        
        return { status: 'success', message: '記錄已更新' };
      }
    }
    
    return { status: 'error', message: '找不到對應的記錄' };
  }
  
  return { status: 'error', message: '未知的操作' };
}

/**
 * 建立鑰匙借還記錄工作表
 */
function createKeysSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet(SHEET_NAMES.KEYS);
  
  // 設定表頭
  const headers = [
    'ID', '借出時間', '借用人類型', '借用人編號', '借用人姓名', 
    '電話號碼', '鑰匙項目', '狀態', '歸還時間', '值班確認人', '值班確認時間'
  ];
  sheet.appendRow(headers);
  
  // 格式化表頭
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f4b400');
  headerRange.setFontColor('#ffffff');
  
  // 凍結表頭
  sheet.setFrozenRows(1);
  
  // 設定電話欄位為文字格式
  const phoneColumn = 6;
  sheet.getRange(2, phoneColumn, sheet.getMaxRows() - 1, 1)
    .setNumberFormat('@STRING@');
  
  // 設定欄寬
  sheet.setColumnWidth(1, 150); // ID
  sheet.setColumnWidth(2, 150); // 借出時間
  sheet.setColumnWidth(3, 100); // 借用人類型
  sheet.setColumnWidth(4, 100); // 借用人編號
  sheet.setColumnWidth(5, 120); // 借用人姓名
  sheet.setColumnWidth(6, 120); // 電話號碼
  sheet.setColumnWidth(7, 200); // 鑰匙項目
  sheet.setColumnWidth(8, 80);  // 狀態
  sheet.setColumnWidth(9, 150); // 歸還時間
  sheet.setColumnWidth(10, 100); // 值班確認人
  sheet.setColumnWidth(11, 150); // 值班確認時間
  
  Logger.log('已建立「鑰匙借還記錄」工作表');
  
  return sheet;
}

// ==================== 鑰匙名稱清單相關 ====================

/**
 * 讀取鑰匙名稱清單
 */
function getKeyNameList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.KEY_LIST);
  
  if (!sheet) {
    sheet = createKeyListSheet();
    return {
      status: 'success',
      recordCount: 0,
      data: []
    };
  }
  
  const data = sheet.getDataRange().getValues();
  const records = [];
  
  // 表頭格式：ID, 鑰匙名稱, 開發業務, 備註, 新增時間
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue;  // 檢查鑰匙名稱欄位
    
    records.push({
      id: row[0],              // ID
      keyName: row[1],         // 鑰匙名稱
      developer: row[2],       // 開發業務
      note: row[3] || '',      // 備註
      createTime: row[4]       // 新增時間
    });
  }
  
  return {
    status: 'success',
    recordCount: records.length,
    data: records
  };
}

/**
 * 新增鑰匙名稱（新版格式）
 */
function addKeyName(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.KEY_LIST);
  
  if (!sheet) {
    sheet = createKeyListSheet();
  }
  
  const keyName = data.keyName;
  const developer = data.developer;
  const note = data.note || '';
  const id = Date.now(); // 生成唯一ID
  
  // 按照表頭順序：ID, 鑰匙名稱, 開發業務, 備註, 新增時間
  sheet.appendRow([
    id,                        // ID
    keyName,                   // 鑰匙名稱
    developer,                 // 開發業務
    note,                      // 備註
    new Date().toISOString()   // 新增時間
  ]);
  
  Logger.log(`✅ 已新增鑰匙名稱：${keyName} (開發業務：${developer})`);
  
  return { 
    status: 'success', 
    message: '鑰匙名稱已新增',
    keyName: keyName,
    developer: developer
  };
}

/**
 * 儲存鑰匙名稱（舊版格式 - 向下兼容）
 */
function saveKeyName(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.KEY_LIST);
  
  if (!sheet) {
    sheet = createKeyListSheet();
  }
  
  const keyData = data.keyData;
  
  sheet.appendRow([
    keyData.id,
    keyData.keyName,
    keyData.developer,
    keyData.note || '',
    new Date().toISOString()
  ]);
  
  Logger.log(`✅ (舊版格式) 已新增鑰匙名稱：${keyData.keyName}`);
  
  return { status: 'success', message: '鑰匙名稱已保存' };
}

/**
 * 建立鑰匙名稱清單工作表
 */
function createKeyListSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet(SHEET_NAMES.KEY_LIST);
  
  // 設定表頭（與舊版格式一致）
  const headers = ['ID', '鑰匙名稱', '開發業務', '備註', '新增時間'];
  sheet.appendRow(headers);
  
  // 格式化表頭
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0f9d58');
  headerRange.setFontColor('#ffffff');
  
  // 凍結表頭
  sheet.setFrozenRows(1);
  
  // 設定欄寬
  sheet.setColumnWidth(1, 150); // ID
  sheet.setColumnWidth(2, 250); // 鑰匙名稱
  sheet.setColumnWidth(3, 120); // 開發業務
  sheet.setColumnWidth(4, 200); // 備註
  sheet.setColumnWidth(5, 150); // 新增時間
  
  Logger.log('已建立「鑰匙名稱清單」工作表');
  
  return sheet;
}

// ==================== 輔助函數 ====================

/**
 * 根據成員ID獲取姓名
 */
function getMemberNameById(memberId) {
  return MEMBERS_MAP[memberId] || memberId;
}

/**
 * 初始化所有工作表（手動執行）
 */
function initializeAllSheets() {
  createScheduleSheet(SHEET_NAMES.SCHEDULE);
  createScheduleSheet(SHEET_NAMES.NEXT_MONTH);
  createKeysSheet();
  createKeyListSheet();
  
  Logger.log('✅ 所有工作表已初始化完成');
  SpreadsheetApp.getUi().alert('✅ 成功建立所有工作表！\n\n包含：\n1. 排班記錄\n2. 次月排班表\n3. 鑰匙借還記錄\n4. 鑰匙名稱清單');
}

// ==================== 測試函數 ====================

/**
 * 測試連線
 */
function testConnection() {
  Logger.log('✅ Google Apps Script 運作正常');
  return { status: 'success', message: '測試成功！' };
}

/**
 * 診斷當前 Sheets 狀態
 */
function diagnoseSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('====== 📊 Google Sheets 診斷報告 ======');
  Logger.log(`Sheets ID: ${ss.getId()}`);
  Logger.log(`Sheets 名稱: ${ss.getName()}`);
  Logger.log(`Sheets URL: ${ss.getUrl()}`);
  Logger.log('');
  
  // 檢查所有工作表
  const sheets = ss.getSheets();
  Logger.log(`總工作表數: ${sheets.length}`);
  Logger.log('');
  
  sheets.forEach((sheet, index) => {
    const sheetName = sheet.getName();
    const rowCount = sheet.getLastRow();
    const dataCount = rowCount > 0 ? rowCount - 1 : 0;
    
    Logger.log(`${index + 1}. 工作表名稱: ${sheetName}`);
    Logger.log(`   - 總行數: ${rowCount}（含表頭）`);
    Logger.log(`   - 數據行數: ${dataCount}`);
    
    // 如果是排班相關工作表，顯示部分數據
    if (sheetName.includes('排班')) {
      if (rowCount > 1) {
        const sampleData = sheet.getRange(2, 1, Math.min(3, dataCount), 8).getValues();
        Logger.log(`   - 前3筆數據樣本:`);
        sampleData.forEach((row, i) => {
          Logger.log(`     [${i + 1}] 年月:${row[1]}, 日期:${row[3]}, 班別:${row[4]}, 成員:${row[5]} ${row[6]}`);
        });
      } else {
        Logger.log(`   - ❌ 工作表為空`);
      }
    }
    Logger.log('');
  });
  
  Logger.log('====== 診斷完成 ======');
  
  SpreadsheetApp.getUi().alert('診斷完成！請查看「執行記錄」（Executions）查看詳細信息。');
}

/**
 * 測試讀取排班記錄
 */
function testReadSchedule() {
  const result = getSchedule('2025-11', SHEET_NAMES.SCHEDULE);
  Logger.log('測試讀取排班記錄：');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * 測試寫入到次月排班表
 */
function testWriteNextMonth() {
  const testData = {
    yearMonth: '2025-12',
    scheduleType: '隨機平均排班',
    scheduleData: {
      '2025-12:1-morning': '01',
      '2025-12:1-evening': '03',
      '2025-12:2-morning': '05'
    },
    members: MEMBERS_MAP,
    action: 'update'
  };
  
  const result = saveSchedule(testData, SHEET_NAMES.NEXT_MONTH);
  Logger.log('測試寫入次月排班表：');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * 清除測試資料
 */
function clearTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [SHEET_NAMES.SCHEDULE, SHEET_NAMES.NEXT_MONTH];
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log(`找不到工作表：${sheetName}`);
      return;
    }
    
    const allData = sheet.getDataRange().getValues();
    let deletedCount = 0;
    
    // 刪除所有測試排班的記錄
    for (let i = allData.length - 1; i >= 1; i--) {
      if (allData[i][2] === '測試排班' || allData[i][2] === '隨機平均排班') {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    
    Logger.log(`「${sheetName}」已清除 ${deletedCount} 筆測試資料`);
  });
}

