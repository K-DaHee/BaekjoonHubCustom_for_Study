/**
 * Github에 풀 리퀘스트 생성하여 문제 풀이 코드 업로드
 * @param {object} bojData - 문제 풀이와 관련된 데이터 객체
 * @param {string} bojData.code - 소스 코드
 * @param {string} bojData.directory - 파일이 저장될 Git 저장소 내의 경로
 * @param {string} bojData.fileName - 파일명
 * @param {string} bojData.message - 커밋 메시지
 * @param {string} bojData.prBody - Pull Request 본문에 들어갈 내용
 * @param {function} cb - 업로드 완료 후 실행될 콜백 함수
 */
async function uploadOneSolveProblemOnGit(bojData, cb) {
  const token = await getToken();
  // 💡 내 포크 레포와 원래 레포 주소를 가져옵니다.
  const fork_hook = await getHook(); // 현재 설정된 '내 레포'
  const upstream_hook = await getUpstreamHook(); // '원래 레포' 주소를 가져오는 설정이 필요합니다.

  if (isNull(token) || isNull(fork_hook) || isNull(upstream_hook)) {
    console.error('인증 토큰, 포크 레포, 또는 원본 레포 정보가 없습니다.');
    return;
  }

  // 내 포크 레포에 새로운 브랜치 만들고 코드 커밋
  const { newBranchName } = await createBranchAndCommit(fork_hook, token,bojData.nameForChange, bojData.code, bojData.directory, bojData.fileName, bojData.message);

  // 원래 레포로 PR 생성
  if (newBranchName) {
    const git = new GitHub(upstream_hook, token); // API 타겟을 '원래 레포'로 설정
    const prTitle = bojData.message;
    
    // PR head 부분에 '내유저네임:브랜치명' 형식으로 지정
    const fork_owner = fork_hook.split('/')[0];
    const headBranch = `${fork_owner}:${newBranchName}`;
    const baseBranch = 'main'; // 원래 레포의 기본 브랜치

    const pullRequest = await git.createPullRequest(prTitle, bojData.prBody, headBranch, baseBranch);
    
    console.log(`원본 저장소로 Pull Request가 성공적으로 생성되었습니다: ${pullRequest.html_url}`);
    
    if (typeof cb === 'function') {
      cb(pullRequest.html_url); // 콜백에 최종 PR 링크 전달
    }
  }
}

/**
 * 스토리지에서 원본(Upstream) 리포지토리 주소를 가져옵니다.
 * @returns {Promise<string>} 원본 리포지토리 주소 (e.g., "owner/repo")
 */
async function getUpstreamHook() {
  return new Promise((resolve) => {
    chrome.storage.local.get('BaekjoonHub_upstream_hook', (data) => {
      resolve(data.BaekjoonHub_upstream_hook);
    });
  });
}

/**
 * Github api를 사용하여 업로드
 * @see https://docs.github.com/en/rest/reference/repos#create-or-update-file-contents
 * @param {string} token - github api 토큰
 * @param {string} hook - github api hook
 * @param {string} sourceText - 업로드할 소스코드 내용
 * @param {string} readmeText - 업로드할 README 내용
 * @param {string} directory - 업로드될 파일의 경로
 * @param {string} filename - 업로드할 파일명
 * @param {string} commitMessage - 커밋 메시지 (예: "[OCT/플랫폼] 1000 Helloworld")
 * @param {function} cb - 콜백 함수 (ex. 업로드 후 로딩 아이콘 처리 등)
 */
async function createBranchAndCommit(hook, token, nameForChange, sourceText, directory, filename, commitMessage) {
  const git = new GitHub(hook, token);
  const stats = await getStats();
  let baseBranch = stats.branches[hook] || await git.getDefaultBranchOnRepo();
  stats.branches[hook] = baseBranch;
  
  // 베이스 브랜치의 최신 '커밋' SHA와 '트리' SHA 가져옴
  const { refSHA: baseBranchSHA } = await git.getReference(baseBranch);
  const { treeSHA: baseTreeSHA } = await git.getCommit(baseBranchSHA);

  // 새 브랜치 생성
  const newBranchName = `${nameForChange}/BOJ-${filename.replace(/[^0-9]/g, '')}`;
  const newBranchRef = `refs/heads/${newBranchName}`;
  await git.createReference(newBranchRef, baseBranchSHA);

  // 파일 Blob 생성 및 새 Tree 생성
  const source = await git.createBlob(sourceText, `${directory}/${filename}`);
  const newTreeSHA = await git.createTree(baseTreeSHA, [source]);

  // 새 커밋 생성 및 브랜치 Head 업데이트
  const commitSHA = await git.createCommit(commitMessage, newTreeSHA, baseBranchSHA);
  await git.updateHead(newBranchRef, commitSHA);

  console.log(`성공: '${newBranchName}' 브랜치에 커밋이 완료되었습니다.`);
  return { newBranchName };
}

/**
 * 브랜치 기반으로 Pull Request 생성
 * @param {string} newBranchName - PR을 보낼 브랜치 이름 (e.g., "플랫폼/problem-1001")
 * @returns {Promise<object>} 생성된 Pull Request 객체
 */
async function createPullRequestFromBranch(hook, token, prBody, commitMessage, newBranchName) {
  const git = new GitHub(hook, token);
  const stats = await getStats();
  const baseBranch = stats.branches[hook];

  // PR 제목 생성 => 커밋 메세지를 이미 수정해뒀기 때문에 동일하게 지정
  const prTitle = commitMessage;

  // PR 생성 API 호출
  return git.createPullRequest(prTitle, prBody, newBranchName, baseBranch);
}