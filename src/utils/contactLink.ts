export interface ContactInfo {
  type: 'phone' | 'kakao' | 'instagram' | 'facebook' | 'telegram' | 'email' | 'url' | 'text';
  value: string;
  displayText: string;
  link?: string;
  icon: string;
}

export function parseMultipleContacts(contact: string): ContactInfo[] {
  // 쉼표로 구분된 여러 문의 방법 처리
  const parts = contact.split(',').map(p => p.trim()).filter(p => p.length > 0);
  return parts.map(part => parseSingleContact(part));
}

function parseSingleContact(contact: string): ContactInfo {
  const trimmed = contact.trim();
  const lower = trimmed.toLowerCase();

  // 전화번호 패턴 (010-1234-5678, 01012345678, +82-10-1234-5678)
  const phonePattern = /(\+?82-?)?0?1[0-9]-?[0-9]{3,4}-?[0-9]{4}/;
  if (phonePattern.test(trimmed)) {
    const cleanNumber = trimmed.replace(/[^0-9+]/g, '');
    return {
      type: 'phone',
      value: cleanNumber,
      displayText: trimmed,
      link: `tel:${cleanNumber}`,
      icon: 'ri-phone-line'
    };
  }

  // 이메일
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailPattern.test(trimmed)) {
    return {
      type: 'email',
      value: trimmed,
      displayText: trimmed,
      link: `mailto:${trimmed}`,
      icon: 'ri-mail-line'
    };
  }

  // URL (http:// 또는 https://)
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      type: 'url',
      value: trimmed,
      displayText: trimmed,
      link: trimmed,
      icon: 'ri-link'
    };
  }

  // 카카오톡 (카톡, 카카오톡, kakao)
  if (/카톡|카카오톡|kakao/i.test(lower)) {
    const id = trimmed.replace(/카톡|카카오톡|kakao/gi, '').trim();
    return {
      type: 'kakao',
      value: id,
      displayText: trimmed,
      icon: 'ri-chat-3-line'
    };
  }

  // 인스타그램
  if (/인스타|instagram|insta|@/i.test(lower)) {
    let username = trimmed.replace(/인스타그램?|instagram|insta/gi, '').trim();
    username = username.replace(/^@/, '');
    if (username) {
      return {
        type: 'instagram',
        value: username,
        displayText: trimmed,
        link: `https://instagram.com/${username}`,
        icon: 'ri-instagram-line'
      };
    }
  }

  // 페이스북
  if (/페이스북|페북|facebook|fb/i.test(lower)) {
    const id = trimmed.replace(/페이스북|페북|facebook|fb/gi, '').trim();
    if (id) {
      return {
        type: 'facebook',
        value: id,
        displayText: trimmed,
        link: `https://facebook.com/${id}`,
        icon: 'ri-facebook-line'
      };
    }
  }

  // 텔레그램
  if (/텔레그램|telegram|@/i.test(lower)) {
    let username = trimmed.replace(/텔레그램?|telegram/gi, '').trim();
    username = username.replace(/^@/, '');
    if (username) {
      return {
        type: 'telegram',
        value: username,
        displayText: trimmed,
        link: `https://t.me/${username}`,
        icon: 'ri-telegram-line'
      };
    }
  }

  // 기본 텍스트
  return {
    type: 'text',
    value: trimmed,
    displayText: trimmed,
    icon: 'ri-chat-3-line'
  };
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  
  // Fallback for older browsers
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      resolve();
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
}
