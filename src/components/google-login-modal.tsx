'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { requestGoogleAccessToken } from '@/lib/google-auth';
import {
  getOrCreateAppRootFolder,
  listDriveSubFolders,
} from '@/lib/client-drive';
import {
  LogIn,
  Key,
  ExternalLink,
  X,
  Loader2,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';

interface GoogleLoginModalProps {
  onSuccess: () => void;
}

export function GoogleLoginModal({ onSuccess }: GoogleLoginModalProps) {
  const {
    clientId,
    setClientId,
    setAuth,
    setRootFolder,
    setSubFolders,
    isConfigModalOpen,
    setIsConfigModalOpen,
  } = useAuthStore();

  const [inputClientId, setInputClientId] = useState(clientId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isConfigModalOpen) return null;

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalId = inputClientId.trim() || clientId;

    if (!finalId) {
      setErrorMessage('Vui lòng nhập Google OAuth 2.0 Client ID');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');
      setClientId(finalId);

      // 1. Authenticate with Google Identity Services popup
      const { accessToken, profile } = await requestGoogleAccessToken(finalId);
      setAuth(accessToken, profile);

      // 2. Automatically find or create dedicated root folder
      const rootFolder = await getOrCreateAppRootFolder(accessToken);
      setRootFolder(rootFolder);

      // 3. Load subfolders
      const subs = await listDriveSubFolders(rootFolder.id, accessToken);
      setSubFolders(subs);

      setIsConfigModalOpen(false);
      onSuccess();
    } catch (err: any) {
      console.error('[GoogleLogin] Error:', err);
      if (err.message === 'MISSING_CLIENT_ID') {
        setErrorMessage('Thiếu Google Client ID.');
      } else {
        setErrorMessage(err.message || 'Đăng nhập Google thất bại');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Đăng nhập Google Drive</h3>
              <p className="text-xs text-neutral-400">Client-Side OAuth 2.0 (GitHub Pages Safe)</p>
            </div>
          </div>
          <button
            onClick={() => setIsConfigModalOpen(false)}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center justify-between">
              <span>Google OAuth Client ID</span>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Lấy Client ID</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                value={inputClientId}
                onChange={(e) => setInputClientId(e.target.value)}
                placeholder="xxxx-xxxx.apps.googleusercontent.com"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1c1c1c] border border-[#333] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
              * Lưu ý: Thêm domain của bạn (ví dụ <code>http://localhost:3000</code> hoặc <code>https://&lt;user&gt;.github.io</code>) vào <b>Authorized JavaScript origins</b> trong Google Cloud Console.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5 text-xs text-neutral-400">
            <div className="flex items-center gap-2 text-neutral-300 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Tự động tạo thư mục riêng</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Sau khi đăng nhập, hệ thống sẽ tự động tìm hoặc tạo một thư mục riêng mang tên <b>DriveStream Media</b> trong Google Drive của bạn. Tài khoản đã có thì sẽ dùng lại, không tạo trùng lặp.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading || !inputClientId.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang kết nối Google...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Đăng nhập với Google</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
