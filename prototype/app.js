const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

const date = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  timeZone: 'Asia/Tokyo',
}).format(new Date());
document.querySelector('#todayDate').textContent = date;

document.querySelector('#startGameButton').addEventListener('click', () => {
  showToast('半荘開始機能は、卓・料金ルールの確認後に実装します。');
});
document.querySelector('#reportButton').addEventListener('click', () => {
  showToast('日報機能はMVPの後続工程で実装します。');
});
document.querySelector('#customerButton').addEventListener('click', () => {
  showToast('顧客登録機能は次の実装工程です。');
});
document.querySelector('#settlementButton').addEventListener('click', () => {
  showToast('会計機能は店舗の料金・支払方法を確認後に実装します。');
});
document.querySelector('#tableButton').addEventListener('click', () => {
  document.querySelector('#tables').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.querySelectorAll('[data-seat]').forEach((button) => {
  button.addEventListener('click', () => showToast('卓への顧客設定は顧客管理機能と合わせて実装します。'));
});
document.querySelector('#periodButton').addEventListener('click', () => {
  showToast('売上期間の切り替えは集計機能の実装後に利用できます。');
});

document.querySelector('#menuButton').addEventListener('click', () => {
  document.querySelector('#sidebar').classList.toggle('open');
});
document.querySelectorAll('.nav-item').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    document.querySelector('#sidebar').classList.remove('open');
  });
});
