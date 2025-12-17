

const PrivacyPage = () => {
    return (
        <div className="p-4 pt-16 pb-40 text-gray-300 min-h-screen bg-black">
            <h1 className="text-2xl font-bold text-white mb-6">개인정보 처리방침</h1>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-bold text-white mb-2">1. 개인정보의 처리 목적</h2>
                    <p>스윙댄스알림판(이하 '서비스')은 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.</p>
                    <ul className="list-disc list-inside mt-2 text-sm text-gray-400">
                        <li>회원 가입 및 관리</li>
                        <li>서비스 제공 및 콘텐츠 이용</li>
                        <li>커뮤니티(게시판) 이용 시 작성자 식별</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">2. 처리하는 개인정보의 항목</h2>
                    <p>서비스는 카카오 로그인을 통해 다음과 같은 정보를 수집합니다:</p>
                    <ul className="list-disc list-inside mt-2 text-sm text-gray-400">
                        <li>필수항목: 닉네임, 이메일, 이름, 성별, 생일, 전화번호(카카오계정)</li>
                        <li>선택항목: 출생연도, 프로필 이미지(카카오 설정에 따름)</li>
                        <li>* 위 정보는 카카오 로그인 시 동의를 거쳐 제공받습니다.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">3. 개인정보의 보유 및 이용 기간</h2>
                    <p>서비스는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.</p>
                    <ul className="list-disc list-inside mt-2 text-sm text-gray-400">
                        <li>회원 탈퇴 시까지</li>
                        <li>관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우에는 해당 수사·조사 종료 시까지</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">4. 개인정보의 파기 절차 및 방법</h2>
                    <p>서비스는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.</p>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">5. Google Analytics 사용</h2>
                    <p>본 사이트는 방문자 통계 분석을 위해 Google Analytics를 사용합니다. Google Analytics는 쿠키를 사용하여 사용자의 사이트 이용 정보를 수집하며, 수집된 정보는 익명화되어 통계 목적으로만 사용됩니다.</p>
                    <p className="mt-2 text-sm text-gray-400">
                        자세한 내용은{' '}
                        <a
                            href="https://policies.google.com/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                        >
                            Google 개인정보처리방침
                        </a>
                        을 참조하세요.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">6. 문의처</h2>
                    <p>개인정보 처리와 관련한 문의는 아래로 연락주시기 바랍니다.</p>
                    <p className="mt-2 text-blue-400">clown313@naver.com</p>
                </section>
            </div>
        </div>
    );
};

export default PrivacyPage;
