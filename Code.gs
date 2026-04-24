    // HuReA Dashboard Backend API - Google Apps Script
    // Để sử dụng: Deploy as Web App -> Copy Web App URL vào file app.js (hiện tại phần web tĩnh đang mô phỏng local)
    // Lưu trữ dữ liệu vào Spreadsheet: Members, Projects, Terms, Evals, ScoreClub, ScoreDept

    const SPREADSHEET_ID = '1ki4lIYHzk8SbSiblinvBQMBTGphh_Hd0C8NnYkmL0ZM'; // ID của file GG Sheet HuReA

    function doGet(e) {
      try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const mode = e.parameter.mode || 'full';
        const configData = getSheetData(ss, 'Config');
        
        let data = { status: 'success' };

        if (mode === 'auth') {
          data.members = getSheetData(ss, 'Members');
          data.userPasswords = getSheetData(ss, 'UserAuth');
          data.terms = getSheetData(ss, 'Terms');
          data.config = configData.length > 0 ? configData[0] : { currentTerm: '', adminPassword: '1' };
        } else {
          data = {
            status: 'success',
            terms: getSheetData(ss, 'Terms'),
            members: getSheetData(ss, 'Members'),
            projects: getSheetData(ss, 'Projects'),
            evaluations: getSheetData(ss, 'Evals'),
            clubScores: getSheetData(ss, 'ScoreClub'),
            deptScores: getSheetData(ss, 'ScoreDept'),
            confessions: getSheetData(ss, 'Confessions'),
            evidences: getSheetData(ss, 'Evidence'),
            announcements: getSheetData(ss, 'Announcements'),
            bugReports: getSheetData(ss, 'BugReports'),
            evidenceImages: getSheetData(ss, 'EvidenceImages'),
            userPasswords: getSheetData(ss, 'UserAuth'),
            commonFolders: getSheetData(ss, 'CommonFolders'),
            meetingPolls: getSheetData(ss, 'MeetingPolls'),
            meetingVotes: getSheetData(ss, 'MeetingVotes'),
            events: getSheetData(ss, 'Events'),
            config: configData.length > 0 ? configData[0] : { currentTerm: '', adminPassword: '1' }
          };
        }
        
        return ContentService.createTextOutput(JSON.stringify(data))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    function doPost(e) {
      try {
        const action = e.parameter.action;
        const payload = JSON.parse(e.postData.contents);
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        
        let result = {};

        switch(action) {
          case 'save_member':
            result = saveRowData(ss, 'Members', payload);
            break;
          case 'save_batch':
            // payload: { sheetName: string, records: Array }
            if (Array.isArray(payload.records)) {
              payload.records.forEach(r => saveRowData(ss, payload.sheetName, r));
              result = { count: payload.records.length };
            } else {
              throw new Error('Payload format error: Expected array in records');
            }
            break;
          case 'save_project':
            // Restore legacy *Str fields for users expecting them in the spreadsheet
            if (payload.participants) payload.participantsStr = JSON.stringify(payload.participants);
            if (payload.teams) payload.teamsStr = JSON.stringify(payload.teams);
            result = saveRowData(ss, 'Projects', payload);
            break;
          case 'delete_project':
            result = deleteRowData(ss, 'Projects', payload.id);
            break;
          case 'save_term':
            result = saveRowData(ss, 'Terms', payload);
            break;
          case 'save_eval':
            result = saveRowData(ss, 'Evals', payload);
            break;
          case 'save_eval_batch':
            // Optimized batch save for evaluations
            if (Array.isArray(payload.evals)) {
              result = batchSaveRows(ss, 'Evals', payload.evals);
            } else {
              throw new Error('Payload format error: Expected array in evals');
            }
            break;
          case 'save_score_club':
            result = updateOrAppendScore(ss, 'ScoreClub', payload);
            break;
          case 'save_score_dept':
            result = updateOrAppendScore(ss, 'ScoreDept', payload);
            break;
          case 'save_score_batch':
            // payload.type is 'ScoreClub' or 'ScoreDept', payload.data is array of records
            result = updateOrAppendScoreBatch(ss, payload.type, payload.records);
            break;
          case 'save_confession':
            result = appendRow(ss, 'Confessions', payload);
            break;
          case 'save_evidence_meta':
            result = updateOrAppendScore(ss, 'Evidence', payload);
            break;
          case 'save_announcement':
            result = saveRowData(ss, 'Announcements', payload);
            break;
          case 'delete_announcement':
            result = deleteRowData(ss, 'Announcements', payload.id);
            break;
          case 'save_bug_report':
            result = appendRow(ss, 'BugReports', payload);
            break;
          case 'save_evidence_image':
            result = appendRow(ss, 'EvidenceImages', payload);
            break;
          case 'save_user_password':
            result = saveRowData(ss, 'UserAuth', payload);
            break;
          case 'save_common_folder':
            result = saveRowData(ss, 'CommonFolders', payload);
            break;
          case 'delete_common_folder':
            result = deleteRowData(ss, 'CommonFolders', payload.id);
            break;
          case 'delete_evidence_image':
            result = deleteRowData(ss, 'EvidenceImages', payload.id);
            break;
          case 'update_user_password':
            result = saveRowData(ss, 'UserAuth', payload);
            break;
          case 'update_admin_password':
            result = updateAdminConfig(ss, 'adminPassword', payload.password);
            break;
          case 'delete_confession':
            result = deleteRowData(ss, 'Confessions', payload.id);
            break;
          case 'save_meeting_poll':
            result = saveRowData(ss, 'MeetingPolls', payload);
            break;
          case 'save_meeting_vote':
            result = saveRowData(ss, 'MeetingVotes', payload);
            break;
          case 'delete_meeting_poll':
            result = deleteRowData(ss, 'MeetingPolls', payload.id);
            break;
          case 'save_event':
            result = saveRowData(ss, 'Events', payload);
            break;
          case 'delete_event':
            result = deleteRowData(ss, 'Events', payload.id);
            break;
          case 'delete_score_record':
            // payload: { type: 'ScoreClub'|'ScoreDept', memberId: string, term: string }
            result = deleteScoreRecord(ss, payload.type, payload.memberId, payload.term);
            break;
          default:
            throw new Error('Action not found: ' + action);
        }

        return ContentService.createTextOutput(JSON.stringify({status: 'success', data: result}))
            .setMimeType(ContentService.MimeType.JSON);

      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
            .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Helper: Tìm sheet không phân biệt hoa thường và khoảng trắng
    function findSheet(ss, name) {
      const sheets = ss.getSheets();
      const cleanName = name.toLowerCase().trim();
      return sheets.find(s => s.getName().toLowerCase().trim() === cleanName);
    }

    // Helper: Lấy toàn bộ dữ liệu Sheet dưới dạng Array of Objects
    function getSheetData(ss, sheetName) {
      const sheet = findSheet(ss, sheetName);
      if(!sheet) return [];
      const data = sheet.getDataRange().getValues();
      if(data.length <= 1) return [];
      
      // Clean headers: lowercase and trim to avoid mismatches
      const headers = data[0].map(h => String(h).toLowerCase().trim());
      const rows = [];
      
      for(let i=1; i<data.length; i++) {
        let obj = {};
        for(let j=0; j<headers.length; j++) {
          let val = data[i][j];
          
          // Auto-parse JSON for known fields or fields ending in Str
          const jsonFields = ['participants', 'teams', 'reasons', 'criteria', 'bcn', 'caremessages', 'mentormessages', 'programeval', 'availability'];
          const isJsonField = jsonFields.includes(headers[j]) || headers[j].toLowerCase().trim().endsWith('str');
          
          if (isJsonField && typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
            try {
              const parsed = JSON.parse(val);
              
              if (headers[j].endsWith('str')) {
                // It's a legacy Str column. Keep the string.
                obj[headers[j]] = val;
                // Fallback: If the base column wasn't parsed (e.g. it was empty), use this parsed data.
                const baseName = headers[j].replace('str', '');
                if (!obj[baseName] || (Array.isArray(obj[baseName]) && obj[baseName].length === 0)) {
                  obj[baseName] = parsed;
                }
              } else {
                // It's a base JSON column (like 'participants')
                obj[headers[j]] = parsed;
              }
            } catch(e) {
              obj[headers[j]] = val;
            }
          } else {
            obj[headers[j]] = val;
          }
        }
        rows.push(obj);
      }
      return rows;
    }

    // Helper: Upsert row (Update nếu trùng ID, Create nếu mới)
    function saveRowData(ss, sheetName, record) {
      let sheet = findSheet(ss, sheetName) || ss.insertSheet(sheetName);
      let range = sheet.getDataRange();
      let data = range.getValues();
      
      // Xử lý sheet hoàn toàn trống
      if (data.length === 1 && data[0].length === 1 && data[0][0] === '') {
        data = [];
      }
      
      // Clean headers for matching
      let headers = data.length > 0 ? data[0].map(h => String(h).toLowerCase().trim()) : [];
      
      // Nếu sheet mới/trống, khởi tạo header từ record (ưu tiên id lên đầu)
      if (headers.length === 0) {
        headers = Object.keys(record).sort((a, b) => a === 'id' ? -1 : (b === 'id' ? 1 : 0));
        sheet.appendRow(headers);
        data = [headers];
      }
      
      // Tự động thêm cột nếu record có field mới
      let columnAdded = false;
      Object.keys(record).forEach(k => {
        const cleanK = String(k).toLowerCase().trim();
        if (headers.indexOf(cleanK) === -1) {
          headers.push(cleanK);
          columnAdded = true;
        }
      });
      
      if (columnAdded) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        data = sheet.getDataRange().getValues();
      }
      
      // Tìm hàng để update theo ID
      let rowIndex = -1;
      let existingValues = [];
      if(record.id) {
        const idColIndex = headers.indexOf('id');
        if (idColIndex > -1) {
          for(let i=1; i<data.length; i++) {
            if(data[i][idColIndex] === record.id) {
              rowIndex = i + 1; // 1-indexed for Sheets
              existingValues = data[i];
              break;
            }
          }
        }
      }

      // Chuẩn bị dữ liệu hàng (Merge với dữ liệu cũ nếu đang update để tránh xóa các cột khác)
      // Tạo bản sao record với key được chuẩn hóa (lowercase/trim) để khớp với headers
      const cleanRecord = {};
      Object.keys(record).forEach(k => {
        cleanRecord[String(k).toLowerCase().trim()] = record[k];
      });

      const recordValues = headers.map((h, idx) => {
        let val = cleanRecord[h];
        
        // Nếu đang update và field này không có trong payload gửi lên, giữ lại giá trị cũ trong sheet
        if (rowIndex > -1 && val === undefined) {
          return existingValues[idx] !== undefined ? existingValues[idx] : '';
        }
        
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val !== undefined ? val : '';
      });
      
      if (rowIndex > -1) {
        sheet.getRange(rowIndex, 1, 1, recordValues.length).setValues([recordValues]);
      } else {
        sheet.appendRow(recordValues);
      }
      
      return record;
    }

    // Helper: Delete row theo ID
    function deleteRowData(ss, sheetName, id) {
      let sheet = ss.getSheetByName(sheetName);
      if(!sheet) return { deleted: false };
      
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return { deleted: false };
      const headers = data[0].map(h => String(h).toLowerCase().trim());
      const idColIndex = headers.indexOf('id');
      if (idColIndex === -1) return { deleted: false };
      
      for(let i=data.length - 1; i>=1; i--) {
        if(String(data[i][idColIndex]) === String(id)) {
          sheet.deleteRow(i + 1);
          return { deleted: true, id: id };
        }
      }
      return { deleted: false };
    }

    function deleteScoreRecord(ss, sheetName, memberId, term) {
      let sheet = findSheet(ss, sheetName);
      if (!sheet) return { deleted: false };
      
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return { deleted: false };
      
      const headers = data[0].map(h => String(h).toLowerCase().trim());
      const mIndex = headers.indexOf('memberid');
      const tIndex = headers.indexOf('term');
      
      if (mIndex === -1 || tIndex === -1) return { deleted: false };
      
      for(let i=data.length - 1; i>=1; i--) {
        if (String(data[i][mIndex]) === String(memberId) && String(data[i][tIndex]) === String(term)) {
          sheet.deleteRow(i + 1);
          return { deleted: true, memberId: memberId, term: term };
        }
      }
      return { deleted: false };
    }

    // Lưu không cần upsert (ví dụ phiếu đánh giá liên tục gửi)
    function appendRow(ss, sheetName, record) {
      return saveRowData(ss, sheetName, { ...record, _timestamp: new Date() });
    }

    function updateOrAppendScore(ss, sheetName, record) {
      // Thêm timestamp để theo dõi
      record.updatedAt = new Date().toISOString();
      
      let sheet = findSheet(ss, sheetName) || ss.insertSheet(sheetName);
      let data = sheet.getDataRange().getValues();
      
      // Khởi tạo sheet nếu mới
      if (data.length === 1 && data[0][0] === '') {
        const headers = Object.keys(record);
        sheet.appendRow(headers);
        sheet.appendRow(headers.map(h => typeof record[h] === 'object' ? JSON.stringify(record[h]) : record[h]));
        return record;
      }

      const headers = data[0].map(h => String(h).toLowerCase().trim());
      const mIndex = headers.indexOf('memberid');
      const tIndex = headers.indexOf('term');
      
      if (mIndex === -1 || tIndex === -1) {
        // Nếu thiếu header bắt buộc, dùng saveRowData như một phương án dự phòng
        return saveRowData(ss, sheetName, record);
      }
      
      let rowIndex = -1;
      for(let i=1; i<data.length; i++) {
        if(String(data[i][mIndex]) === String(record.memberId) && String(data[i][tIndex]) === String(record.term)) {
          rowIndex = i + 1;
          break;
        }
      }

      // Map dữ liệu vào đúng cột dựa trên header
      const recordValues = headers.map(h => {
        // Tìm key trong record (không phân biệt hoa thường)
        const key = Object.keys(record).find(k => k.toLowerCase().trim() === h);
        const val = key ? record[key] : '';
        return typeof val === 'object' ? JSON.stringify(val) : val;
      });
      
      if (rowIndex > -1) {
        sheet.getRange(rowIndex, 1, 1, recordValues.length).setValues([recordValues]);
      } else {
        sheet.appendRow(recordValues);
      }

      return record;
    }

    function updateOrAppendScoreBatch(ss, sheetName, records) {
      if (!Array.isArray(records) || records.length === 0) return { success: true, count: 0 };
      
      let sheet = findSheet(ss, sheetName) || ss.insertSheet(sheetName);
      let range = sheet.getDataRange();
      let data = range.getValues();
      
      // Ensure header/sheet initialized with first record
      if (data.length === 1 && data[0][0] === '') {
        const headers = Object.keys(records[0]);
        headers.push('updatedAt');
        sheet.appendRow(headers);
        data = [headers];
      }
      
      const headers = data[0].map(h => String(h).toLowerCase().trim());
      const mIndex = headers.indexOf('memberid');
      const tIndex = headers.indexOf('term');
      
      if (mIndex === -1 || tIndex === -1) {
        throw new Error('Mandatory headers (memberId, term) not found in ' + sheetName);
      }

      const timestamp = new Date().toISOString();
      
      records.forEach(record => {
        record.updatedAt = timestamp;
        let rowIndex = -1;
        
        for(let i=1; i<data.length; i++) {
          if(String(data[i][mIndex]) === String(record.memberId) && String(data[i][tIndex]) === String(record.term)) {
            rowIndex = i + 1;
            break;
          }
        }
        
        const recordValues = headers.map(h => {
          const key = Object.keys(record).find(k => k.toLowerCase().trim() === h);
          const val = key ? record[key] : '';
          return typeof val === 'object' ? JSON.stringify(val) : val;
        });
        
        if (rowIndex > -1) {
          sheet.getRange(rowIndex, 1, 1, recordValues.length).setValues([recordValues]);
        } else {
          sheet.appendRow(recordValues);
          // Update local data to prevent duplicate append in same batch if member entries repeated
          data.push(recordValues);
        }
      });
      
      return { success: true, count: records.length };
    }

    function updateAdminConfig(ss, key, value) {
      let sheet = findSheet(ss, 'Config') || ss.insertSheet('Config');
      let data = sheet.getDataRange().getValues();
      let headers = data.length > 0 ? data[0].map(h => String(h).toLowerCase().trim()) : [];
      
      if (headers.length === 0) {
        headers = [key];
        sheet.appendRow(headers);
        sheet.appendRow([value]);
        return { [key]: value };
      }
      
      let keyIdx = headers.indexOf(key.toLowerCase().trim());
      if (keyIdx === -1) {
        headers.push(key.toLowerCase().trim());
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        keyIdx = headers.length - 1;
      }
      
      // Always update the first data row (row 2)
      if (data.length <= 1) {
        let newRow = headers.map((h, i) => i === keyIdx ? value : '');
        sheet.appendRow(newRow);
      } else {
        sheet.getRange(2, keyIdx + 1).setValue(value);
      }
      
      return { [key]: value };
    }

    function batchSaveRows(ss, sheetName, records) {
      if (!records || records.length === 0) return { count: 0 };
      
      let sheet = findSheet(ss, sheetName) || ss.insertSheet(sheetName);
      let range = sheet.getDataRange();
      let data = range.getValues();
      if (data.length === 1 && data[0][0] === '') data = [];
      
      let headers = data.length > 0 ? data[0].map(h => String(h).toLowerCase().trim()) : [];
      
      if (headers.length === 0) {
        headers = Object.keys(records[0]).sort((a, b) => a === 'id' ? -1 : (b === 'id' ? 1 : 0)).map(h => h.toLowerCase().trim());
        sheet.appendRow(headers);
        data = [headers];
      }
      
      let headersModified = false;
      records.forEach(record => {
        Object.keys(record).forEach(k => {
          const cleanK = String(k).toLowerCase().trim();
          if (headers.indexOf(cleanK) === -1) {
            headers.push(cleanK);
            headersModified = true;
          }
        });
      });
      
      if (headersModified) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        data = sheet.getDataRange().getValues();
      }
      
      const idColIndex = headers.indexOf('id');
      const newRows = [];
      
      records.forEach(record => {
        const cleanRecord = {};
        Object.keys(record).forEach(k => {
          cleanRecord[String(k).toLowerCase().trim()] = record[k];
        });
        
        const rowValues = headers.map(h => {
          let val = cleanRecord[h];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val !== undefined ? val : '';
        });
        
        let rowIndex = -1;
        if (record.id && idColIndex > -1) {
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][idColIndex]) === String(record.id)) {
              rowIndex = i + 1;
              break;
            }
          }
        }
        
        if (rowIndex > -1) {
          sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
        } else {
          newRows.push(rowValues);
          data.push(rowValues);
        }
      });
      
      if (newRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
      }
      
      return { count: records.length };
    }

