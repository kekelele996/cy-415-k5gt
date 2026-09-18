import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';
import { PointEntryType } from './point';
import { SettlementStatus } from './settlement';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会同步写入 localStorage 和 IndexedDB',
  exchangeEmpty: '还没有交换请求，先去首页挑一件合眼缘的物品',
  profileUpdated: '个人资料已更新',
};

export const FORM_MESSAGES = {
  requiredTitle: '物品标题不能为空',
  requiredDescription: '请描述你希望交换的物品',
  requiredPhone: '请填写联系方式',
  imageLimit: '最多上传 4 张图片',
  exchangeNeedOwnItem: '请先发布一件可交换物品',
};

export const SETTLEMENT_MESSAGES = {
  accepted: (amount: number) => `已同意交换，双方各冻结 ${amount} 点平台积分作为诚信金`,
  insufficient: (amount: number) => `对方平台积分不足 ${amount} 点，本次同意已整体拒绝，未冻结任何积分`,
  confirmWaiting: '已确认完成，等待对方确认后解冻诚信金',
  confirmedAlready: '你已经确认完成，等待对方确认',
  released: (amount: number) => `双方已确认完成，各解冻 ${amount} 点诚信金`,
  canceled: (amount: number) => `已取消交换，你冻结的 ${amount} 点已赔付给对方`,
  canceledCounterpart: (amount: number) => `对方已取消交换，你获赔 ${amount} 点，本人冻结积分已解冻`,
  settleFailed: '结算失败，所有积分与交换状态已回到操作前',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with status maps',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}, ${ExchangeStatus.CANCELLED}`,
  settlementStatusUsed: `SettlementStatus includes ${SettlementStatus.FROZEN}, ${SettlementStatus.RELEASED}, ${SettlementStatus.COMPENSATED}`,
};

export const STATUS_MESSAGE_MAP = {
  [ItemStatus.AVAILABLE]: '这件物品可发起交换',
  [ItemStatus.EXCHANGED]: '这件物品已完成交换',
  [ItemStatus.OFFLINE]: '这件物品已下架',
  [ExchangeStatus.PENDING]: '等待对方确认',
  [ExchangeStatus.ACCEPTED]: '交换已同意，双方各冻结 20 点诚信金',
  [ExchangeStatus.REJECTED]: '交换请求已拒绝',
  [ExchangeStatus.COMPLETED]: '双方确认完成，诚信金已原额解冻',
  [ExchangeStatus.CANCELLED]: '交换已取消，取消方冻结份额已赔付对方',
} as Record<ItemStatus | ExchangeStatus, string>;

export const POINT_ENTRY_TEXT: Record<PointEntryType, string> = {
  [PointEntryType.FREEZE]: '冻结诚信金',
  [PointEntryType.UNFREEZE]: '解冻诚信金',
  [PointEntryType.FORFEIT]: '取消违约划扣',
  [PointEntryType.COMPENSATE]: '收到取消赔付',
};

export const SETTLEMENT_STATUS_TEXT: Record<SettlementStatus, string> = {
  [SettlementStatus.FROZEN]: '诚信金冻结中',
  [SettlementStatus.RELEASED]: '诚信金已解冻',
  [SettlementStatus.COMPENSATED]: '诚信金已赔付',
};
