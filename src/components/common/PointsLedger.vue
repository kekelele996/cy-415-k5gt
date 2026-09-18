<template>
  <section class="points-ledger">
    <h2>我的积分流水</h2>
    <p v-if="!flows.length" class="form-note">{{ PAGE_MESSAGES.pointsEmpty }}</p>
    <ul v-else class="points-ledger__list">
      <li v-for="flow in flows" :key="flow.id">
        <div>
          <strong>{{ formatPointsFlowType(flow.type) }}</strong>
          <small>{{ formatDate(flow.created_at) }}<template v-if="flow.remark"> · {{ flow.remark }}</template></small>
        </div>
        <span class="points-ledger__delta" :class="deltaClass(flow)">{{ formatPointsDelta(flow.available_delta, flow.frozen_delta) }}</span>
        <small class="points-ledger__balance">
          可用 {{ flow.balance_after }} / 冻结 {{ flow.frozen_after }}
        </small>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { PAGE_MESSAGES } from '@/constants/messages';
import { PointsFlowType } from '@/constants/deposit';
import type { PointsFlow } from '@/models/points';
import { useAuthStore } from '@/stores/authStore';
import { usePointsStore } from '@/stores/pointsStore';
import { formatDate, formatPointsDelta, formatPointsFlowType } from '@/utils/formatters';

const authStore = useAuthStore();
const pointsStore = usePointsStore();
const flows = computed(() =>
  authStore.currentUser ? pointsStore.flowsOf(authStore.currentUser.id) : ([] as PointsFlow[]),
);

const deltaClass = (flow: PointsFlow) => {
  if (flow.type === PointsFlowType.FREEZE) return 'is-freeze';
  if (flow.available_delta > 0) return 'is-plus';
  return 'is-neutral';
};
</script>
