/**
 * Google Drive REST API v3 utilities.
 * All calls are made directly from the browser using the OAuth access token.
 * No backend needed.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** Fetch only the signed-in user's email address */
export async function fetchUserInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch user info");
  const userInfo = await res.json();
  if (!userInfo.email) throw new Error("Google did not return an account email");
  return { email: userInfo.email };
}

/** Create the app-owned sync folder in Drive root */
export async function createFolder(accessToken, name = "KODIGO Sync") {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) throw new Error("Failed to create folder");
  return res.json(); // { id, name }
}

/** Find a specific file by name inside a folder. Returns file metadata or null. */
export async function findFile(accessToken, folderId, filename) {
  const q = encodeURIComponent(
    `name='${filename}' and '${folderId}' in parents and trashed=false`
  );
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to search files");
  const data = await res.json();
  return (data.files || [])[0] || null;
}

/** Upload (create or update) a JSON file in a Drive folder */
export async function uploadJson(accessToken, folderId, filename, jsonData, existingFileId = null) {
  const content = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([content], { type: "application/json" });

  const form = new FormData();

  if (existingFileId) {
    // PATCH — update existing file content
    form.append(
      "metadata",
      new Blob([JSON.stringify({ name: filename })], { type: "application/json" })
    );
    form.append("file", blob);
    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!res.ok) throw new Error(`Failed to update ${filename}`);
    return res.json();
  } else {
    // POST — create new file inside folder
    form.append(
      "metadata",
      new Blob(
        [JSON.stringify({ name: filename, parents: [folderId] })],
        { type: "application/json" }
      )
    );
    form.append("file", blob);
    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!res.ok) throw new Error(`Failed to create ${filename}`);
    return res.json();
  }
}

/** Download and parse a JSON file from Drive by file ID */
export async function downloadJson(accessToken, fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to download file");
  return res.json();
}
