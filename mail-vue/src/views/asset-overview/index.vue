<template>
  <div class="asset-overview">
    <div class="page-title">
      <div>
        <h2>资产概览</h2>
        <p>统计邮箱资产、可接管域名和外部邮箱资产。</p>
      </div>
      <el-button type="primary" plain @click="loadData">刷新</el-button>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>邮箱资产总数</span>
        <strong>{{ fmt(data.total) }}</strong>
      </div>
      <div class="summary-card">
        <span>正常资产</span>
        <strong>{{ fmt(data.normal) }}</strong>
      </div>
      <div class="summary-card accent">
        <span>可接管域名资产</span>
        <strong>{{ fmt(data.receivable) }}</strong>
      </div>
      <div class="summary-card warn">
        <span>外部邮箱资产</span>
        <strong>{{ fmt(data.external) }}</strong>
      </div>
      <div class="summary-card success">
        <span>中视频已加入</span>
        <strong>{{ fmt(data.creatorJoined) }}</strong>
      </div>
      <div class="summary-card danger">
        <span>中视频被拒</span>
        <strong>{{ fmt(data.creatorRejected) }}</strong>
      </div>
      <div class="summary-card accent">
        <span>到期可重申</span>
        <strong>{{ fmt(data.creatorRetryReady) }}</strong>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>域名资产统计</h3>
        <span>已配置域名：{{ (data.configuredDomains || []).join(' / ') || '-' }}</span>
      </div>
      <el-table v-loading="loading" :data="data.domains || []" style="width: 100%">
        <el-table-column prop="domain" label="域名" min-width="180">
          <template #default="scope">
            <div class="domain-cell">
              <span>{{ scope.row.domain }}</span>
              <el-tag v-if="scope.row.canReceive" type="success" size="small">已接管</el-tag>
              <el-tag v-else type="info" size="small">外部资产</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="normal" label="正常邮箱" width="120"/>
        <el-table-column prop="assetMarked" label="资产标记" width="120"/>
        <el-table-column prop="creatorJoined" label="中视频已加入" width="130"/>
        <el-table-column prop="creatorRejected" label="中视频被拒" width="120"/>
        <el-table-column prop="creatorRetryReady" label="可重申" width="100"/>
        <el-table-column prop="deleted" label="已删除" width="100"/>
        <el-table-column label="最近同步" min-width="180">
          <template #default="scope">
            {{ fmtTime(scope.row.creatorLastCheckedAt || scope.row.lastAgentSyncAt || scope.row.lastStatsSyncAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130">
          <template #default="scope">
            <el-button size="small" text type="primary" @click="openAssets(scope.row.domain)">查看资产</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import {onMounted, reactive, ref} from 'vue'
import router from '@/router/index.js'
import {assetOverview} from '@/request/asset.js'
import {tzDayjs} from '@/utils/day.js'

defineOptions({
  name: 'asset-overview'
})

const loading = ref(false)
const data = reactive({
  total: 0,
  normal: 0,
  assetMarked: 0,
  receivable: 0,
  external: 0,
  creatorJoined: 0,
  creatorRejected: 0,
  creatorRetryReady: 0,
  configuredDomains: [],
  domains: []
})

onMounted(loadData)

function loadData() {
  loading.value = true
  assetOverview().then(res => {
    Object.assign(data, res || {})
  }).finally(() => {
    loading.value = false
  })
}

function openAssets(domain) {
  router.push({name: 'email-assets', query: {domain}})
}

function fmt(value) {
  return Number(value || 0).toLocaleString()
}

function fmtTime(value) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style scoped lang="scss">
.asset-overview {
  padding: 18px;
}

.page-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 22px;
  }

  p {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.summary-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 18px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);

  span {
    display: block;
    color: var(--el-text-color-secondary);
    margin-bottom: 10px;
  }

  strong {
    font-size: 30px;
    line-height: 1;
  }
}

.summary-card.accent strong {
  color: #1890ff;
}

.summary-card.success strong {
  color: #67c23a;
}

.summary-card.danger strong {
  color: #f56c6c;
}

.summary-card.warn strong {
  color: #e6a23c;
}

.panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 14px;
  background: var(--el-bg-color);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;

  h3 {
    margin: 0;
  }

  span {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.domain-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
