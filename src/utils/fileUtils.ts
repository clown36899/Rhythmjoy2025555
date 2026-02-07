export const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const sanitizeFileName = (fileName: string): string => {
    // 파일명에서 확장자 제거
    const nameWithoutExt = fileName.split(".")[0];

    // 전각 문자를 반각으로 변환
    let normalized = nameWithoutExt.replace(/[\uFF01-\uFF5E]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    );

    // 영문, 숫자, 하이픈, 언더스코어만 남기고 나머지는 제거
    normalized = normalized.replace(/[^a-zA-Z0-9-_]/g, "");

    // 연속된 특수문자 제거
    normalized = normalized.replace(/[-_]+/g, "_");

    // 앞뒤 특수문자 제거
    normalized = normalized.replace(/^[-_]+|[-_]+$/g, "");

    return normalized || "image";
};
