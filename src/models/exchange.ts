import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  status: ExchangeStatus;
  message: string;
  /** 诚信金结算单 id：同意交换并成功冻结后写入，与冻结同一次事务持久化 */
  deposit_settlement_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<Exchange, 'id' | 'status' | 'created_at' | 'updated_at' | 'deposit_settlement_id'> & {
  status?: ExchangeStatus;
  deposit_settlement_id?: string | null;
};
