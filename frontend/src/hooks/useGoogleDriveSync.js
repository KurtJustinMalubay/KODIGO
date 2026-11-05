/**
 * useGoogleDriveSync — master hook for Google Auth + Drive sync state.
 *
 * Persists:
 *   kodigo_google_user     — { email }
 *   kodigo_drive_folder_id — KODIGO sync folder ID
 *   kodigo_last_synced_at  — ISO timestamp of last successful sync
 */

import { useCallback, useRef, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { fetchUserInfo, createFolder } from "../utils/driveApi";
import {
  checkDriveHasData,
  checkLocalHasData,
  pushToDrive,
  pullFromDrive,
} from "../utils/syncManager";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const LS_USER = "kodigo_google_user";
const LS_FOLDER = "kodigo_drive_folder_id";
const LS_FOLDER_ACCOUNT = "kodigo_drive_folder_account";
const LS_SYNCED = "kodigo_last_synced_at";

function loadSavedUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_USER));
    if (!saved?.email) return null;
    localStorage.setItem(LS_USER, JSON.stringify({ email: saved.email }));
    if (
      localStorage.getItem(LS_FOLDER) &&
      !localStorage.getItem(LS_FOLDER_ACCOUNT)
    ) {
      localStorage.setItem(LS_FOLDER_ACCOUNT, saved.email);
    }
    return { email: saved.email };
  } catch {
    return null;
  }
}

export function useGoogleDriveSync({ onSyncComplete } = {}) {
  // ── Persistent state ──────────────────────────────────────────────────────
  const [user, setUser] = useState(loadSavedUser);
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

  // Conflict modal state
  const [showConflictModal, setShowConflictModal] = useState(false);
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
      saveUser({ email: userInfo.email });

      // If we already have a saved folder, go straight to sync
      const savedFolder = localStorage.getItem(LS_FOLDER);
      const savedFolderAccount = localStorage.getItem(LS_FOLDER_ACCOUNT);
      if (savedFolder && savedFolderAccount === userInfo.email) {
        await beginSync(token, savedFolder);
      } else {
        const folder = await createFolder(token, "KODIGO Sync");
        saveFolder(folder.id);
        localStorage.setItem(LS_FOLDER_ACCOUNT, userInfo.email);
        await beginSync(token, folder.id);
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
    setLastSyncedAt(null);
    localStorage.removeItem(LS_SYNCED);
    setSyncError("");
    setSyncStatus("");
  }, [saveUser]);

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
