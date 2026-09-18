import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会同步写入 localStorage 和 IndexedDB',
  exchangeEmpty: '还没有交换请求，先去首页挑一件合眼缘的物品',
  profileUpdated: '个人资料已更新',
  pointsEmpty: '暂无积分变动，同意一次交换后这里会出现诚信金流水',
};

export const DEPOSIT_MESSAGES = {
  freezeHint: '同意后双方各冻结 20 点平台积分，余额不足将整次拒绝',
  bothConfirmHint: '双方都确认完成后，各自冻结的 20 点原额解冻',
  cancelHint: '取消后你冻结的 20 点将赔付给对方，对方自身冻结份额原额解冻',
  waitOtherConfirm: '你已确认完成，等待对方确认',
};

export const FORM_MESSAGES = {
  requiredTitle: '物品标题不能为空',
  requiredDescription: '请描述你希望交换的物品',
  requiredPhone: '请填写联系方式',
  imageLimit: '最多上传 4 张图片',
  exchangeNeedOwnItem: '请先发布一件可交换物品',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with status maps',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}, ${ExchangeStatus.CANCELLED}`,
};

export const STATUS_MESSAGE_MAP = {
  [ItemStatus.AVAILABLE]: '这件物品可发起交换',
  [ItemStatus.EXCHANGED]: '这件物品已完成交换',
  [ItemStatus.OFFLINE]: '这件物品已下架',
  [ExchangeStatus.PENDING]: '等待对方确认',
  [ExchangeStatus.ACCEPTED]: '双方诚信金已冻结，等待双方确认完成',
  [ExchangeStatus.REJECTED]: '交换请求已拒绝',
  [ExchangeStatus.COMPLETED]: '交换完成，诚信金已原额解冻',
  [ExchangeStatus.CANCELLED]: '交换已取消，诚信金已按规则赔付',
};
