import * as XLSX from "xlsx";
import { api, API_BASE } from "../api";

/**
 * Extracts plain text from Excel (.xlsx, .xls, .csv) files in the browser
 */
export async function extractTextFromExcel(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  let fullText = "";

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    fullText += `\n--- Sheet: ${sheetName} ---\n`;
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    fullText += csv + "\n";
  });

  return fullText.trim();
}

/**
 * Extracts text from PDF files via the backend stateless endpoint
 */
export async function extractTextFromDocument(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  // Excel / CSV on-device extraction
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return await extractTextFromExcel(file);
  }

  // Plain text / Markdown
  if (["txt", "md", "json"].includes(ext)) {
    return await file.text();
  }

  // PDFs or office docs: use stateless extraction
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/extract-text`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.extracted_text) return data.extracted_text;
    }
  } catch (err) {
    console.warn("Document extraction error:", err);
  }

  return "";
}

/**
 * Parses raw text from syllabus, class records, grade sheets, or curriculum
 * into structured academic subjects & assessments using AI.
 */
export async function parseAcademicRecordsWithAI(rawText, filename = "") {
  const truncatedText = rawText.slice(0, 15000); // Send up to 15k chars

  const prompt = `You are an academic data assistant. Convert the following class record, syllabus, or grade sheet into structured JSON format.

Document filename: ${filename}

Document text:
"""
${truncatedText}
"""

Instructions:
1. Extract every subject/course found in the text.
2. For each subject, extract:
   - "subject": course name / code (e.g., "Quantitative Methods", "Automata & Computability", "Data Structures")
   - "current_standing": standing/grade if mentioned (e.g. "85%", "2.0", or leave empty "")
   - "target_grade": target grade if mentioned (or empty "")
   - "notes": brief summary of topics or struggle areas if present (or empty "")
   - "assessments": array of objects with:
       - "type": "Quiz", "Activity", "Exam", "Assignment", or "Project"
       - "title": assessment title (e.g., "Quiz 1 - Logic Gates")
       - "score": numeric score achieved (or 0)
       - "total": numeric maximum total points (e.g., 20 or 100)
       - "date": YYYY-MM-DD or empty string ""

Output strictly a valid JSON array of subjects with NO markdown fences, NO explanation. Example:
[
  {
    "subject": "Quantitative Methods",
    "current_standing": "82%",
    "target_grade": "90%",
    "notes": "Linear programming, probability distributions",
    "assessments": [
      { "type": "Quiz", "title": "Quiz 1", "score": 16, "total": 20, "date": "" }
    ]
  }
]`;

  try {
    // Call the stateless chat endpoint with mode="chat" to let the AI process it
    const tempChatId = "temp_parser_" + Date.now();
    const result = await api.send(tempChatId, prompt, "chat", null);
    const reply = (result.ai?.content || "").trim();

    // Clean any markdown fences if present
    const cleaned = reply
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => ({
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subject: item.subject || "Untitled Subject",
        target_grade: item.target_grade || "",
        current_standing: item.current_standing || "",
        notes: item.notes || "",
        assessments: Array.isArray(item.assessments)
          ? item.assessments.map((a) => ({
              id: `ass_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: a.type || "Quiz",
              title: a.title || "Assessment",
              score: Number(a.score) || 0,
              total: Number(a.total) || 100,
              date: a.date || "",
            }))
          : [],
      }));
    }
  } catch (err) {
    console.error("AI class record parsing error:", err);
    throw new Error("Could not automatically parse subjects from document: " + err.message);
  }

  throw new Error("No subjects could be detected in this file.");
}

/**
 * Export academic class records as a .krec file (JSON format)
 */
export function exportAcademicRecords(records) {
  const exportPayload = {
    app: "KODIGO",
    type: "academic_records",
    version: "1.0",
    exported_at: new Date().toISOString(),
    records,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kodigo_academic_records_${new Date().toISOString().slice(0, 10)}.krec`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import academic records from a .krec or .json file
 */
export async function importAcademicRecordsFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  let rawList = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed && Array.isArray(parsed.records)) {
    rawList = parsed.records;
  } else {
    throw new Error("Invalid .krec or JSON file format.");
  }

  // Ensure unique IDs
  return rawList.map((rec) => ({
    ...rec,
    id: rec.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assessments: (rec.assessments || []).map((a) => ({
      ...a,
      id: a.id || `ass_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    })),
  }));
}
