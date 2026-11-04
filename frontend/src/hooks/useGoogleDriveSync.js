/**
 * useGoogleDriveSync — master hook for Google Auth + Drive sync state.
 *
 * Persists:
 *   kodigo_google_user     — { id, email, name, picture }
 *   kodigo_drive_folder_id — chosen Drive folder ID
 *   kodigo_last_synced_at  — ISO timestamp of last successful sync
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { fetchUserInfo, listFolders, createFolder } from "../utils/driveApi";
import {
  checkDriveHasData,
  checkLocalHasData,
  pushToDrive,
  pullFromDrive,
} from "../utils/syncManager";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const LS_USER = "kodigo_google_user";
const LS_FOLDER = "kodigo_drive_folder_id";
const LS_SYNCED = "kodigo_last_synced_at";

export function useGoogleDriveSync({ onSyncComplete } = {}) {
  // ── Persistent state ──────────────────────────────────────────────────────
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; }
  });
  const [folderId, setFolderId] = useState(() =>
    localStorage.getItem(LS_FOLDER) || null
  );
  const [lastSyncedAt, setLastSyncedAt] = useState(() =>
    localStorage.getItem(LS_SYNCED) || null
  );

  // ── Ephemeral state ───────────────────────────────────────────────────────
  const [accessToken, setAccessToken] = useState(null);
  const tokenExpiryRef = useRef(null);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(""); // progress text
  const [syncError, setSyncError] = useState("");

  // Conflict / folder-picker modal state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [folders, setFolders] = useState([]);
  const [conflictInfo, setConflictInfo] = useState(null);

  // Pending action after folder is chosen / conflict resolved
  const pendingActionRef = useRef(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const saveUser = useCallback((u) => {
    setUser(u);
    if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
    else localStorage.removeItem(LS_USER);
  }, []);

  const saveFolder = useCallback((id) => {
    setFolderId(id);
    if (id) localStorage.setItem(LS_FOLDER, id);
    else localStorage.removeItem(LS_FOLDER);
  }, []);

  const saveSyncedAt = useCallback((iso) => {
    setLastSyncedAt(iso);
    if (iso) localStorage.setItem(LS_SYNCED, iso);
  }, []);

  // ── OAuth login ───────────────────────────────────────────────────────────

  const handleLoginSuccess = useCallback(async (tokenResponse) => {
    const token = tokenResponse.access_token;
    setAccessToken(token);
    // Token expires in ~3600s; store expiry time
    tokenExpiryRef.current = Date.now() + (tokenResponse.expires_in || 3600) * 1000;

    try {
      const userInfo = await fetchUserInfo(token);
      saveUser(userInfo);

      // If we already have a saved folder, go straight to sync
      const savedFolder = localStorage.getItem(LS_FOLDER);
      if (savedFolder) {
        await beginSync(token, savedFolder);
      } else {
        // Open folder picker
        const folderList = await listFolders(token);
        setFolders(folderList);
        setShowFolderPicker(true);
      }
    } catch (err) {
      setSyncError("Sign-in failed: " + err.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveUser]);

  const googleLogin = useGoogleLogin({
    onSuccess: handleLoginSuccess,
    onError: (err) => setSyncError("Google sign-in failed. Please try again."),
    scope: SCOPES,
    flow: "implicit",
  });

  // ── Sign out ──────────────────────────────────────────────────────────────

  const signOut = useCallback(() => {
    setAccessToken(null);
    tokenExpiryRef.current = null;
    saveUser(null);
    saveFolder(null);
    setLastSyncedAt(null);
    localStorage.removeItem(LS_SYNCED);
    setSyncError("");
    setSyncStatus("");
  }, [saveUser, saveFolder]);

  // ── Folder picker ─────────────────────────────────────────────────────────

  const handleFolderChosen = useCallback(async (chosenFolderId) => {
    setShowFolderPicker(false);
    saveFolder(chosenFolderId);
    await beginSync(accessToken, chosenFolderId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, saveFolder]);

  const handleCreateFolder = useCallback(async (name = "KODIGO Sync") => {
    try {
      const folder = await createFolder(accessToken, name);
      setFolders((prev) => [...prev, folder]);
      await handleFolderChosen(folder.id);
    } catch (err) {
      setSyncError("Failed to create folder: " + err.message);
    }
  }, [accessToken, handleFolderChosen]);

  // ── Core sync logic ───────────────────────────────────────────────────────

  const beginSync = useCallback(async (token, folder) => {
    setSyncing(true);
    setSyncError("");
    setSyncStatus("Checking data…");

    try {
      const [driveInfo, localInfo] = await Promise.all([
        checkDriveHasData(token, folder),
        checkLocalHasData(),
      ]);

      if (driveInfo.hasData && localInfo.hasData) {
        // Both have data — show conflict modal
        setConflictInfo({ driveInfo, localInfo });
        setShowConflictModal(true);
        // Actual sync happens after user picks a resolution
        pendingActionRef.current = { token, folder };
        setSyncing(false);
        return;
      }

      if (localInfo.hasData && !driveInfo.hasData) {
        // Only local data — push up
        await pushToDrive(token, folder, (s) => setSyncStatus(s));
      } else if (driveInfo.hasData && !localInfo.hasData) {
        // Only Drive data — pull down
        await pullFromDrive(token, folder, "replace", (s) => setSyncStatus(s));
      } else {
        // Both empty — nothing to do
        setSyncStatus("Nothing to sync");
      }

      const now = new Date().toISOString();
      saveSyncedAt(now);
      setSyncStatus("");
      onSyncComplete?.();
    } catch (err) {
      setSyncError("Sync failed: " + err.message);
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSyncedAt, onSyncComplete]);

  // Called when user resolves conflict
  const resolveConflict = useCallback(async (resolution) => {
    // resolution: "merge" | "keep-local" | "use-drive"
    setShowConflictModal(false);
    const { token, folder } = pendingActionRef.current || {};
    if (!token || !folder) return;

    setSyncing(true);
    setSyncError("");
    try {
      if (resolution === "keep-local") {
        await pushToDrive(token, folder, (s) => setSyncStatus(s));
      } else if (resolution === "use-drive") {
        await pullFromDrive(token, folder, "replace", (s) => setSyncStatus(s));
      } else {
        // merge
        await pullFromDrive(token, folder, "merge", (s) => setSyncStatus(s));
        await pushToDrive(token, folder, (s) => setSyncStatus(s));
      }
      const now = new Date().toISOString();
      saveSyncedAt(now);
      setSyncStatus("");
      onSyncComplete?.();
    } catch (err) {
      setSyncError("Sync failed: " + err.message);
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  }, [saveSyncedAt, onSyncComplete]);

  // ── Manual sync button ────────────────────────────────────────────────────

  const manualSync = useCallback(async () => {
    if (!accessToken || !folderId) {
      // Need to re-auth (token expired or not signed in)
      googleLogin();
      return;
    }
    // Check if token expired
    if (tokenExpiryRef.current && Date.now() > tokenExpiryRef.current) {
      googleLogin();
      return;
    }
    await beginSync(accessToken, folderId);
  }, [accessToken, folderId, beginSync, googleLogin]);

  // ── Expose ────────────────────────────────────────────────────────────────

  return {
    // State
    user,
    folderId,
    lastSyncedAt,
    syncing,
    syncStatus,
    syncError,
    setSyncError,

    // Folder picker modal
    showFolderPicker,
    setShowFolderPicker,
    folders,
    handleFolderChosen,
    handleCreateFolder,

    // Conflict modal
    showConflictModal,
    conflictInfo,
    resolveConflict,

    // Actions
    signIn: googleLogin,
    signOut,
    manualSync,
  };
}
