<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ source: string }>()

marked.use({
  breaks: true,
  gfm: true,
})

const html = computed(() =>
  DOMPurify.sanitize(marked.parse(props.source || '') as string),
)
</script>

<template>
  <div class="markdown-chat text-left" v-html="html" />
</template>

<style scoped>
.markdown-chat {
  font-size: 11px;
  line-height: 1.55;
  color: rgb(226 232 240);
  word-break: break-word;
}

.markdown-chat :deep(h1),
.markdown-chat :deep(h2),
.markdown-chat :deep(h3) {
  font-size: 12px;
  font-weight: 600;
  color: rgb(248 250 252);
  margin: 0.65rem 0 0.35rem;
  line-height: 1.35;
}

.markdown-chat :deep(h1:first-child),
.markdown-chat :deep(h2:first-child),
.markdown-chat :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-chat :deep(p) {
  margin: 0 0 0.45rem;
}

.markdown-chat :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-chat :deep(strong) {
  font-weight: 600;
  color: rgb(241 245 249);
}

.markdown-chat :deep(em) {
  font-style: italic;
  color: rgb(203 213 225);
}

.markdown-chat :deep(ul),
.markdown-chat :deep(ol) {
  margin: 0.35rem 0 0.5rem;
  padding-left: 1.1rem;
}

.markdown-chat :deep(li) {
  margin: 0.2rem 0;
}

.markdown-chat :deep(li > p) {
  margin: 0.15rem 0;
}

.markdown-chat :deep(hr) {
  border: none;
  border-top: 1px solid rgb(255 255 255 / 0.12);
  margin: 0.55rem 0;
}

.markdown-chat :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.35);
  color: rgb(186 230 253);
}

.markdown-chat :deep(pre) {
  margin: 0.45rem 0;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  background: rgb(0 0 0 / 0.4);
  overflow-x: auto;
}

.markdown-chat :deep(pre code) {
  padding: 0;
  background: transparent;
  color: rgb(226 232 240);
}

.markdown-chat :deep(blockquote) {
  margin: 0.45rem 0;
  padding-left: 0.55rem;
  border-left: 2px solid rgb(59 130 246 / 0.45);
  color: rgb(148 163 184);
}

.markdown-chat :deep(a) {
  color: rgb(96 165 250);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-chat :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  margin: 0.45rem 0;
}

.markdown-chat :deep(th),
.markdown-chat :deep(td) {
  border: 1px solid rgb(255 255 255 / 0.1);
  padding: 0.25rem 0.35rem;
  text-align: left;
}

.markdown-chat :deep(th) {
  background: rgb(255 255 255 / 0.06);
  font-weight: 600;
}
</style>
