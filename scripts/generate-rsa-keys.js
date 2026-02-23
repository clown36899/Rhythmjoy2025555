import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const result = dotenv.config();
// .env.local fallback
if (!process.env.VITE_PUBLIC_SUPABASE_URL) {
    const localEnv = dotenv.config({ path: '.env.local' });
    if (localEnv.error) console.log('No .env.local found');
}

console.log('Environment Debug:');
console.log('SUPABASE_URL:', process.env.VITE_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing');
console.log('SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Found' : 'Missing');




// Interactive prompt for missing credentials
async function getCredential(query, envKey) {
    if (process.env[envKey]) return process.env[envKey];
    return new Promise((resolve) => {
        rl.question(`${query}: `, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('=== 보안 키 생성기 (RSA + Master Password) ===');

    const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || await getCredential('Supabase URL을 입력하세요 (예: https://...supabase.co)', 'VITE_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || await getCredential('Supabase Service Key를 입력하세요 (service_role)', 'SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('필수 정보가 입력되지 않았습니다.');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const masterPassword = await new Promise(resolve => {
        rl.question('설정할 마스터 비밀번호(2차 비밀번호)를 입력하세요: ', resolve);
    });

    if (!masterPassword || masterPassword.length < 6) {
        console.error('비밀번호는 최소 6자 이상이어야 합니다.');
        process.exit(1);
    }

    console.log('\n[1/3] RSA 2048비트 키 쌍 생성 중...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    console.log('[2/3] 개인키 암호화 중...');
    // 1. Salt 생성
    const salt = crypto.randomBytes(16).toString('hex');
    // 2. Key Derivation (PBKDF2)
    const key = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');
    // 3. Encrypt Private Key (AES-256-GCM)
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
    encryptedPrivateKey += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // 저장 포맷: encryptedData + authTag (GCM은 태그 필수)
    const finalEncryptedKey = encryptedPrivateKey + ':' + authTag;
    const finalIv = iv.toString('hex');

    console.log('[3/3] DB(public.system_keys)에 저장 중...');

    // 기존 키 삭제 (덮어쓰기)
    await supabase.from('system_keys').delete().eq('id', 1);

    const { error } = await supabase
        .from('system_keys')
        .upsert({
            id: 1,
            public_key: publicKey,
            encrypted_private_key: finalEncryptedKey,
            salt: salt,
            iv: finalIv,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('DB 저장 실패:', error);
        if (error.code === '42P01') {
            console.error('테이블이 없습니다. migration_rsa.sql을 먼저 실행해주세요.');
        }
    } else {
        console.log('\n성공! 보안 키가 저장되었습니다.');
        console.log('비밀번호를 안전한 곳에 보관하세요.');
    }

    rl.close();
    process.exit(0);
}

main();
