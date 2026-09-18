<template>
  <article class="exchange-card">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>{{ formatDate(exchange.updated_at) }}</small>
    </header>
    <div class="exchange-card__items">
      <div>
        <span>拿出</span>
        <strong>{{ fromItem?.title ?? '未知物品' }}</strong>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
      </div>
    </div>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>

    <div v-if="settlement" class="exchange-card__earnest">
      <div class="earnest-line">
        <span class="earnest-tag">{{ formatSettlementStatus(settlement.status) }}</span>
        <em>每方 {{ settlement.amount_per_side }} 点平台积分</em>
      </div>
      <div class="earnest-parties">
        <span :class="{ confirmed: settlement.confirmed_by_from }">
          {{ fromUser?.nickname ?? '发起方' }}：{{ settlement.confirmed_by_from ? '已确认完成' : '待确认' }}
        </span>
        <span :class="{ confirmed: settlement.confirmed_by_to }">
          {{ toUser?.nickname ?? '接收方' }}：{{ settlement.confirmed_by_to ? '已确认完成' : '待确认' }}
        </span>
      </div>
      <small v-if="settlement.status === SettlementStatus.COMPENSATED && cancelerName" class="earnest-cancel">
        取消方：{{ cancelerName }}，其冻结的 {{ settlement.amount_per_side }} 点已划转给对方
      </small>
    </div>

    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <button v-if="exchange.status === ExchangeStatus.PENDING && isReceiver" type="button" @click="$emit('accept', exchange.id)">
          同意
        </button>
        <button
          v-if="exchange.status === ExchangeStatus.PENDING && isReceiver"
          class="secondary-button"
          type="button"
          @click="$emit('reject', exchange.id)"
        >
          拒绝
        </button>
        <template v-if="exchange.status === ExchangeStatus.ACCEPTED">
          <button type="button" @click="$emit('complete', exchange.id)">
            {{ iHaveConfirmed ? '已确认，等待对方' : '确认完成' }}
          </button>
          <button class="secondary-button" type="button" @click="$emit('cancel', exchange.id)">
            取消交换
          </button>
        </template>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { ExchangeStatus } from '@/constants/exchange';
import { SettlementStatus } from '@/constants/settlement';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { ExchangeSettlement } from '@/models/settlement';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatExchangeStatus,
  formatSettlementStatus,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
  settlement?: ExchangeSettlement | null;
}>();

defineEmits<{
  accept: [id: string];
  reject: [id: string];
  complete: [id: string];
  cancel: [id: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const isReceiver = computed(() => authStore.currentUser?.id === props.exchange.to_user_id);
const isParty = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    authStore.currentUser?.id === props.exchange.from_user_id,
);
const canOperate = computed(
  () =>
    isParty.value &&
    (props.exchange.status === ExchangeStatus.PENDING || props.exchange.status === ExchangeStatus.ACCEPTED),
);
const iHaveConfirmed = computed(() => {
  if (!props.settlement || !authStore.currentUser) return false;
  return authStore.currentUser.id === props.exchange.from_user_id
    ? props.settlement.confirmed_by_from
    : props.settlement.confirmed_by_to;
});
const cancelerName = computed(() =>
  props.settlement?.canceled_by
    ? props.users.find((user) => user.id === props.settlement?.canceled_by)?.nickname ?? ''
    : '',
);
</script>
