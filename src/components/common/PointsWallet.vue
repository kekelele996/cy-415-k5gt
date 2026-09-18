<template>
  <div class="points-wallet">
    <div>
      <span>可用积分</span>
      <strong>{{ account?.available ?? 0 }}</strong>
    </div>
    <div>
      <span>冻结中</span>
      <strong>{{ account?.frozen ?? 0 }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useAuthStore } from '@/stores/authStore';
import { usePointsStore } from '@/stores/pointsStore';

const authStore = useAuthStore();
const pointsStore = usePointsStore();
const account = computed(() =>
  authStore.currentUser ? pointsStore.accountOf(authStore.currentUser.id) : null,
);
</script>
