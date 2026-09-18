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

    <div v-if="settlement" class="exchange-card__deposit">
      <span class="deposit-tag" :class="depositToneClass(settlement.status)">
        {{ formatDepositStatus(settlement.status) }}
      </span>
      <span>每方冻结 {{ settlement.amount }} 点 · 共 {{ settlement.amount * 2 }} 点</span>
      <span v-if="settlement.status === DepositStatus.HELD" class="deposit-confirm">
        完成确认 {{ settlement.confirmed_by.length }}/2
        <em v-if="iConfirmed">（我已确认）</em>
      </span>
      <span v-else-if="settlement.status === DepositStatus.FORFEITED && settlement.cancelled_by">
        {{ cancelledByNickname }} 取消并赔付
      </span>
    </div>

    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <button
          v-if="exchange.status === ExchangeStatus.PENDING"
          type="button"
          :disabled="busy"
          @click="$emit('accept', exchange.id)"
        >
          同意
        </button>
        <button v-if="exchange.status === ExchangeStatus.PENDING" type="button" :disabled="busy" @click="$emit('reject', exchange.id)">
          拒绝
        </button>
        <button
          v-if="exchange.status === ExchangeStatus.ACCEPTED"
          type="button"
          class="secondary-button"
          :disabled="busy || iConfirmed"
          @click="$emit('complete', exchange.id)"
        >
          {{ iConfirmed ? '已确认，待对方' : '确认完成' }}
        </button>
        <button
          v-if="exchange.status === ExchangeStatus.ACCEPTED"
          type="button"
          class="exchange-card__cancel"
          :disabled="busy"
          @click="$emit('cancel', exchange.id)"
        >
          取消交换
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { DepositStatus } from '@/constants/deposit';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { DepositSettlement } from '@/models/points';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatDepositStatus,
  formatExchangeStatus,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
  settlements: DepositSettlement[];
  busy?: boolean;
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
const settlement = computed(
  () => props.settlements.find((item) => item.exchange_id === props.exchange.id) ?? null,
);
const iConfirmed = computed(() =>
  Boolean(
    authStore.currentUser && settlement.value?.confirmed_by.includes(authStore.currentUser.id),
  ),
);
const cancelledByNickname = computed(() => {
  if (!settlement.value?.cancelled_by) return '对方';
  return props.users.find((user) => user.id === settlement.value?.cancelled_by)?.nickname ?? '对方';
});
const canOperate = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    (authStore.currentUser?.id === props.exchange.from_user_id &&
      (props.exchange.status === ExchangeStatus.ACCEPTED ||
        props.exchange.status === ExchangeStatus.PENDING)),
);

const depositToneClass = (status: DepositStatus) => {
  if (status === DepositStatus.RELEASED) return 'status-done';
  if (status === DepositStatus.FORFEITED) return 'status-muted';
  return 'status-wait';
};
</script>
