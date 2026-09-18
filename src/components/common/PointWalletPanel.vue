<template>
  <section class="wallet-panel">
    <header class="wallet-panel__head">
      <h2>平台积分</h2>
      <p>诚信金结算全程走积分账户，冻结、解冻、赔付均生成流水</p>
    </header>
    <div v-if="account" class="wallet-panel__balance">
      <div>
        <span>可用积分</span>
        <strong>{{ account.balance }}</strong>
      </div>
      <div>
        <span>冻结积分</span>
        <strong>{{ account.frozen }}</strong>
      </div>
      <div>
        <span>总额（可用 + 冻结）</span>
        <strong>{{ account.balance + account.frozen }}</strong>
      </div>
    </div>

    <h3>余额流水</h3>
    <div v-if="entries.length" class="wallet-entries">
      <div v-for="entry in entries" :key="entry.id" class="wallet-entry">
        <div>
          <strong>{{ formatPointEntryType(entry.type) }}</strong>
          <small>{{ entry.remark }}</small>
          <small>{{ formatDate(entry.created_at) }}</small>
        </div>
        <div class="wallet-entry__amount">
          <span>{{ formatEntryAmount(entry) }}</span>
          <em>余额 {{ entry.balance_after }} / 冻结 {{ entry.frozen_after }}</em>
        </div>
      </div>
    </div>
    <p v-else class="wallet-empty">暂无积分流水，同意一笔交换后会冻结双方诚信金</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useWalletStore } from '@/stores/walletStore';
import { formatDate, formatEntryAmount, formatPointEntryType } from '@/utils/formatters';

const props = defineProps<{
  userId: string;
}>();

const walletStore = useWalletStore();
const account = computed(() => walletStore.accountOf(props.userId));
const entries = computed(() => walletStore.entriesOf(props.userId));
</script>
