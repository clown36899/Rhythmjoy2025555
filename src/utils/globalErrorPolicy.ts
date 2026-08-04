const normalizeRuntimeErrorText = (message: string, stack = '') => (
  `${message}\n${stack}`.trim().toLowerCase()
);

export const isNonFatalClientRuntimeError = (message: string, stack = '') => {
  const text = normalizeRuntimeErrorText(message, stack);

  // 배포 청크 오류는 별도 자동 새로고침 경로에서 처리해야 한다.
  if (
    text.includes('dynamically imported module')
    || text.includes('chunkloaderror')
    || text.includes('loading chunk')
  ) {
    return false;
  }

  const isTransientNetworkFailure = [
    'failed to fetch',
    'networkerror when attempting to fetch resource',
    'network request failed',
    'the internet connection appears to be offline',
    'load failed',
  ].some((pattern) => text.includes(pattern));

  const isStaleIndexedDbVersion = (
    text.includes('requested version')
    && text.includes('less than the existing version')
  );

  return isTransientNetworkFailure || isStaleIndexedDbVersion;
};
