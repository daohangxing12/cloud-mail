<template>
  <div class="mail-workbench">
    <section class="mail-list-pane">
      <emailScroll type="star" ref="scroll"
                   :allow-star="false"
                   :cancel-success="cancelStar"
                   :getEmailList="starList"
                   :emailDelete="emailDelete"
                   :star-add="starAdd"
                   :star-cancel="starCancel"
                   :compact-layout="true"
                   :selected-email-id="selectedEmail?.emailId || 0"
                   @jump="jumpContent"
                   actionLeft="6px"
                   :show-account-icon="false"
      />
    </section>
    <section class="mail-preview-pane">
      <MailPreview
          :email="selectedEmail"
          del-type="logic"
          :show-unread="false"
          :show-star="true"
          :show-reply="true"
          @deleted="afterRemove"
          @navigate="navigate"
          @blocked="clearSelected"
      />
    </section>
  </div>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import MailPreview from "@/components/mail-preview/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel, starList} from "@/request/star.js";
import {useEmailStore} from "@/store/email.js";
import {defineOptions, onMounted, ref, watch} from "vue";
import router from "@/router/index.js";

defineOptions({
  name: 'star'
})

const scroll = ref({})
const selectedEmail = ref(null)
const emailStore = useEmailStore();

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  if (isThreePane()) {
    selectedEmail.value = email
    return
  }
  router.push('/message')
}

function cancelStar(email) {
  emailStore.cancelStarEmailId = email.emailId
  scroll.value.deleteEmail([email.emailId])
  if (selectedEmail.value?.emailId === email.emailId) {
    clearSelected()
  }
}

onMounted(() => {
  emailStore.starScroll = scroll
})

watch(() => emailStore.deleteIds, (ids) => {
  const deleteIds = Array.isArray(ids) ? ids : [ids]
  if (selectedEmail.value && deleteIds.includes(selectedEmail.value.emailId)) {
    clearSelected()
  }
})

// 上一封 / 下一封（step = -1 / 1）
function navigate(step) {
  const list = scroll.value?.emailList || []
  const i = list.findIndex(e => e.emailId === selectedEmail.value?.emailId)
  const next = i >= 0 ? list[i + step] : null
  if (next) jumpContent(next)
}

// 删除或移走后，自动打开下一封（没有下一封就打开上一封）
function afterRemove(email) {
  const list = (scroll.value?.emailList || []).filter(e => e.emailId !== email?.emailId)
  const old = (scroll.value?.emailList || []).findIndex(e => e.emailId === email?.emailId)
  const next = list[old] || list[old - 1]
  if (next && isThreePane()) jumpContent(next)
  else clearSelected()
}

function clearSelected() {
  selectedEmail.value = null
}

function isThreePane() {
  return window.innerWidth > 1024
}

</script>

<style scoped>
.mail-workbench {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  overflow: hidden;
  background: var(--el-bg-color);
}

.mail-list-pane,
.mail-preview-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.mail-preview-pane {
  background: var(--el-bg-color);
}

@media (max-width: 1024px) {
  .mail-workbench {
    display: block;
  }

  .mail-list-pane {
    height: 100%;
  }

  .mail-preview-pane {
    display: none;
  }
}
</style>
