import { useMemo, useState } from 'react';
import {
  clearClientLogs,
  getClientLogText,
  getClientLogs,
  type ClientLogEntry,
} from '../utils/clientLogBuffer';
import '../styles/components/MobileLogViewer.css';

type MobileLogViewerPlacement = 'hidden' | 'floating' | 'drawer';

interface MobileLogViewerProps {
  placement?: MobileLogViewerPlacement;
}

function summarizeLatest(logs: ClientLogEntry[]) {
  const latestError = [...logs].reverse().find((log) => log.level === 'error' || log.level === 'warn');
  if (!latestError) return '문제 상황이 생기면 여기서 로그를 복사할 수 있습니다.';
  return latestError.message.slice(0, 90);
}

export default function MobileLogViewer({ placement = 'hidden' }: MobileLogViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<ClientLogEntry[]>(() => getClientLogs());
  const [copyStatus, setCopyStatus] = useState('');

  const logText = useMemo(() => getClientLogText(), [logs]);
  const errorCount = logs.filter((log) => log.level === 'error').length;
  const warnCount = logs.filter((log) => log.level === 'warn').length;

  const refresh = () => {
    setLogs(getClientLogs());
    setCopyStatus('');
  };

  const copyLogs = async () => {
    const text = getClientLogText();

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('복사됨');
    } catch {
      setCopyStatus('복사 실패: 아래 내용을 길게 눌러 전체 선택하세요.');
    }

    setLogs(getClientLogs());
  };

  const clearLogs = () => {
    clearClientLogs();
    setLogs([]);
    setCopyStatus('비움');
  };

  if (placement === 'hidden') return null;

  return (
    <div className={`mobile-log-viewer mobile-log-viewer--${placement} ${isOpen ? 'is-open' : ''}`}>
      {!isOpen && (
        <button
          type="button"
          className={placement === 'drawer' ? 'mobile-log-viewer__drawer-trigger' : 'mobile-log-viewer__trigger'}
          onClick={() => {
            refresh();
            setIsOpen(true);
          }}
          aria-label="모바일 로그 열기"
        >
          {placement === 'drawer' ? (
            <>
              <i className="ri-file-list-3-line" aria-hidden="true" />
              <span>모바일 로그</span>
              <strong>LOG</strong>
            </>
          ) : (
            'LOG'
          )}
          {(errorCount > 0 || warnCount > 0) && (
            <span className="mobile-log-viewer__dot" aria-label={`${errorCount} errors, ${warnCount} warnings`} />
          )}
        </button>
      )}

      {isOpen && (
        <section className="mobile-log-viewer__panel" aria-label="모바일 로그">
          <header className="mobile-log-viewer__header">
            <div>
              <strong>모바일 로그</strong>
              <span>{logs.length}개 저장 · 에러 {errorCount} · 경고 {warnCount}</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="모바일 로그 닫기">
              닫기
            </button>
          </header>

          <p className="mobile-log-viewer__summary">{summarizeLatest(logs)}</p>

          <div className="mobile-log-viewer__actions">
            <button type="button" onClick={copyLogs}>복사</button>
            <button type="button" onClick={refresh}>새로고침</button>
            <button type="button" onClick={clearLogs}>비우기</button>
          </div>

          {copyStatus && <span className="mobile-log-viewer__status">{copyStatus}</span>}

          <textarea
            className="mobile-log-viewer__textarea"
            readOnly
            value={logText}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="복사용 로그 내용"
          />
        </section>
      )}
    </div>
  );
}
