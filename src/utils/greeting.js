export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 5) return '夜深了，背几个词就休息吧';
  if (hour < 9) return '早上好，先温故再出门';
  if (hour < 12) return '上午好，读两页收几个词';
  if (hour < 14) return '中午好，趁空翻一翻';
  if (hour < 18) return '下午好，慢慢来就好';
  if (hour < 22) return '晚上好，今天的词还记得吗';
  return '很晚了，复习完就睡吧';
}
