import { computed, createApp, ref, watch } from "/node_modules/vue/dist/vue.esm-browser.js";
import { deleteJson, getJson, postJson } from "./api.js";
import {
  defaultCityOptions,
  displayArtists,
  displayVenue,
  eventDisplayTags,
  formatDate,
  formatDetailDate,
  isConcreteVenueName,
  isConcreteWorkTitle,
  routePageFromHash,
  routeParamFromHash,
  toDateKey,
  typeLabel,
  typeOptions
} from "./domain.js";
import { loadNotebook, saveNotebook } from "./notebook-store.js";

const template = `
  <header class="topbar">
    <a class="brand brand-button" href="#/home" aria-label="Eventnote Japan 首页">
      <span class="brand-mark">E</span>
      <span>Eventnote Japan</span>
    </a>
    <nav v-if="!isAccountPage" class="nav" aria-label="主导航">
      <a v-for="item in visibleNavItems" :key="item.id" :href="\`#/\${item.id}\`" :class="{ active: isNavActive(item.id) }" @click="go(item.id)">
        {{ item.label }}
      </a>
    </nav>
    <form class="top-search" role="search" @submit.prevent="submitGlobalSearch">
      <div class="top-search-wrap">
        <input
          v-model="globalQuery"
          type="search"
          placeholder="ラブライブ"
          aria-label="全局搜索"
          @focus="showGlobalSuggestions = true"
          @input="handleGlobalInput"
          @keydown.enter="submitGlobalSearch"
          @blur="hideGlobalSuggestionsSoon"
        >
        <button type="submit" aria-label="搜索">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.4-4.4"></path><circle cx="11" cy="11" r="7"></circle></svg>
        </button>
        <div v-if="showGlobalSuggestions && hasGlobalSuggestions" class="global-suggestion-panel">
          <section v-for="group in globalSuggestionGroups" :key="group.id">
            <h3>{{ group.label }}</h3>
            <button v-for="suggestion in group.items" :key="suggestion.type + suggestion.value" type="button" @pointerdown.prevent="applyGlobalSuggestion(suggestion)">
              <span>
                <template v-for="(part, index) in suggestionParts(suggestion.value, globalQuery)" :key="index">
                  <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                </template>
              </span>
              <small>{{ suggestion.meta || suggestion.label }}</small>
            </button>
          </section>
          <button v-for="suggestion in globalSuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyGlobalSuggestion(suggestion)">
            <span>{{ suggestion }}</span>
            <small>搜索</small>
          </button>
        </div>
      </div>
    </form>
    <div class="top-actions">
      <button class="ghost-button account-chip" type="button" @click="go('profile')">
        {{ authUser ? authUser.displayName : "登录" }}
      </button>
    </div>
  </header>

  <nav v-if="!isAccountPage && page !== 'event'" class="mobile-tabs" aria-label="移动导航">
    <a v-for="item in mobileNavItems" :key="item.id" :href="\`#/\${item.id}\`" :class="{ active: isNavActive(item.id), add: item.add }" @click="go(item.id)">
      {{ item.short }}
    </a>
  </nav>

  <main class="page-shell">
    <section v-if="page === 'home'" class="home-page">
      <section class="mobile-dashboard home-overview">
        <div class="app-greeting">
          <div>
            <p>Event planning workspace</p>
            <h1>{{ authUser ? "我的活动控制台" : "发现并管理活动" }}</h1>
          </div>
        </div>

        <section class="wallet-card">
          <div>
            <span>{{ authUser ? "我的收藏活动" : "可检索活动" }}</span>
            <strong>{{ authUser ? favoriteItems.length.toLocaleString("ja-JP") : meta.events?.toLocaleString("ja-JP") || "..." }}</strong>
          </div>
          <p>{{ authUser ? "Upcoming plans, follows, calendar sync" : "Eventernote archive with personal planning" }}</p>
          <small>{{ authUser ? "关注 " + followedEntityCount.toLocaleString("ja-JP") + " 个对象" : selectedDate + " · 本月 " + calendarTotal.toLocaleString("ja-JP") + " 场" }}</small>
        </section>

        <div class="service-grid">
          <button type="button" @click="go('events')"><span>日</span>活动日历</button>
          <button type="button" @click="go('artists')"><span>声</span>出演者</button>
          <button type="button" @click="go('works')"><span>作</span>作品企划</button>
          <button type="button" @click="go('venues')"><span>場</span>会场</button>
        </div>
      </section>

      <section class="dashboard app-stats compact-stats" aria-label="活动概览">
        <div class="metric"><span>出演者</span><strong>{{ meta.artists?.toLocaleString("ja-JP") || "..." }}</strong></div>
        <div class="metric"><span>会场</span><strong>{{ meta.venues?.toLocaleString("ja-JP") || "..." }}</strong></div>
        <div class="metric"><span>当前月活动</span><strong>{{ calendarTotal.toLocaleString("ja-JP") }}</strong></div>
      </section>

      <section class="home-intent-strip">
        <div>
          <span>{{ authUser ? "管理模式" : "发现模式" }}</span>
          <strong>{{ authUser ? "先处理近期计划" : "先从搜索和日历找到活动" }}</strong>
          <p>{{ authUser ? "收藏、状态和日历同步会集中在我的活动里。" : "不登录也能查活动；登录后再把想去的活动沉淀成计划。" }}</p>
        </div>
        <div>
          <span>数据新鲜度</span>
          <strong>{{ dataFreshnessLabel }}</strong>
          <p>{{ dataFreshnessSummary }}</p>
        </div>
      </section>

      <section class="management-strip">
        <article class="management-card primary-plan">
          <span>下一步</span>
          <strong>{{ authUser ? nextPlanLabel : "先收藏想去的活动" }}</strong>
          <p>{{ authUser ? "从详情页更新抽选、购票、参战状态。" : "登录后可把活动加入个人日历并记录票务状态。" }}</p>
          <button class="secondary-button" type="button" @click="authUser ? go('favorites') : go('profile')">
            {{ authUser ? "打开我的活动" : "开始管理" }}
          </button>
        </article>
        <article class="management-card">
          <span>即将到来</span>
          <strong>{{ upcomingFavoriteItems.length.toLocaleString("ja-JP") }}</strong>
          <p>收藏活动中日期不早于今天的项目。</p>
        </article>
        <article class="management-card">
          <span>关注对象</span>
          <strong>{{ followedEntityCount.toLocaleString("ja-JP") }}</strong>
          <p>出演者、作品、会场会汇总到我的页面。</p>
        </article>
      </section>

      <section class="home-sections">
        <div class="content-grid">
          <div class="section-head">
            <div>
              <p class="eyebrow">{{ authUser && upcomingFavoriteItems.length ? "My next plans" : "Today pick" }}</p>
              <h2>{{ authUser && upcomingFavoriteItems.length ? "近期收藏活动" : selectedDateLabel }}</h2>
            </div>
            <button class="ghost-button" type="button" @click="authUser && upcomingFavoriteItems.length ? go('favorites') : go('events')">View All</button>
          </div>
          <div class="event-list compact">
            <article v-for="event in homeEvents" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
              <div class="date-box">
                <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
              </div>
              <div>
                <h3 class="event-title">{{ event.title }}</h3>
                <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span></div>
                <div v-if="eventCardTags(event).length" class="tag-row">
                  <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                </div>
              </div>
              <button class="primary-button join-button" :class="{ joined: isJoined(event) }" type="button" @click.stop="toggleJoin(event)">
                {{ authUser ? (isJoined(event) ? "已收藏" : "想去") : "登录收藏" }}
              </button>
            </article>
            <p v-if="homeEvents.length === 0" class="muted">{{ loading ? "加载中..." : "还没有可展示活动。" }}</p>
          </div>
        </div>

        <div class="home-side-grid">
          <section class="panel">
            <div class="panel-head">
              <h2>热门会场</h2>
              <button class="ghost-button" type="button" @click="go('venues')">更多</button>
            </div>
            <div class="venue-list">
              <div v-for="venue in venues.slice(0, 5)" :key="venue.id">
                <strong>{{ displayVenue(venue.name) }}</strong>
                <span>{{ venue.events.toLocaleString("ja-JP") }} 场</span>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <h2>常用检索</h2>
              <button class="ghost-button" type="button" @click="go('events')">搜索</button>
            </div>
            <div class="quick-strip">
              <button type="button" @click="quickSearch('水瀬いのり')">水瀬いのり</button>
              <button type="button" @click="quickSearch('ラブライブ')">ラブライブ</button>
              <button type="button" @click="quickSearch('コナン')">コナン</button>
              <button type="button" @click="quickSearch('横浜アリーナ')">横浜アリーナ</button>
            </div>
          </section>
        </div>
      </section>
    </section>

    <section v-if="page === 'events'" class="page-view events-workspace">
      <div class="workspace-topline">
        <div class="month-switcher">
          <button class="icon-button" type="button" aria-label="上个月" @click="changeMonth(-1)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg>
          </button>
          <div>
            <strong>{{ calendarTitle }}</strong>
            <span>{{ calendarTotal.toLocaleString("ja-JP") }} 场匹配活动</span>
          </div>
          <button class="icon-button" type="button" aria-label="下个月" @click="changeMonth(1)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg>
          </button>
        </div>
        <button class="primary-button desktop-add-button" type="button" @click="authUser ? go('favorites') : go('profile')">+ 添加活动</button>
      </div>

      <form class="filter-bar" :class="{ expanded: showMobileFilters }" @submit.prevent>
        <label class="search-field">
          <span>关键词</span>
          <div class="search-input-wrap">
            <input v-model="query" type="search" placeholder="声优、作品、会场" @focus="showQuerySuggestions = true" @keydown.enter="hideSuggestions" @change="hideSuggestions" @blur="hideSuggestionsSoon">
            <button v-if="query" class="clear-search-button" type="button" aria-label="清空关键词" @click="query = ''">x</button>
            <div v-if="showQuerySuggestions && hasQuerySuggestions" class="suggestion-list grouped-suggestion-list">
              <section v-for="group in querySuggestionGroups" :key="group.id">
                <h3>{{ group.label }}</h3>
                <button v-for="suggestion in group.items" :key="suggestion.type + suggestion.value" type="button" @pointerdown.prevent="applyQuerySuggestion(suggestion)">
                  <span>
                    <template v-for="(part, index) in suggestionParts(suggestion.value, query)" :key="index">
                      <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                  <small>{{ suggestion.meta || suggestion.label }}</small>
                </button>
              </section>
              <button v-for="suggestion in querySuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyQuerySuggestion(suggestion)">
                <span>
                  <template v-for="(part, index) in suggestionParts(suggestion, query)" :key="index">
                    <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <small>搜索</small>
              </button>
            </div>
          </div>
        </label>
        <button class="mobile-filter-toggle" type="button" :class="{ active: city !== 'all' || eventType !== 'all' }" @click="showMobileFilters = !showMobileFilters">
          筛选
        </button>
        <label class="search-field advanced-filter">
          <span>地区</span>
          <select v-model="city">
            <option v-for="[value, label] in cityOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="search-field advanced-filter">
          <span>类型</span>
          <select v-model="eventType">
            <option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <p v-if="loadError" class="load-error">{{ loadError }}</p>
      </form>

      <div class="event-workbench">
        <div class="events-main-column">
          <section class="desktop-date-strip" aria-label="日期选择">
            <button
              v-for="day in desktopDateStrip"
              :key="day.key"
              type="button"
              :class="{ active: day.date === selectedDate, muted: !day.inMonth }"
              @click="selectDate(day.date)"
            >
              <span>{{ day.weekday }}</span>
              <strong>{{ day.day }}</strong>
              <small>{{ day.count || "-" }}</small>
            </button>
          </section>

          <section class="calendar-panel mobile-calendar-panel">
            <p v-if="loadError" class="load-error calendar-error">{{ loadError }}</p>
            <div class="calendar-head">
              <button class="icon-button" type="button" aria-label="上个月" @click="changeMonth(-1)">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg>
              </button>
              <div>
                <p class="eyebrow">Calendar</p>
                <div class="calendar-title-row">
                  <h2>{{ Number(currentMonth.slice(5, 7)) }}月</h2>
                  <label class="compact-year-select" aria-label="选择年份">
                    <select :value="currentYear" @change="setYear($event.target.value)">
                      <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}年</option>
                    </select>
                  </label>
                </div>
                <p class="muted">本月 {{ calendarTotal.toLocaleString("ja-JP") }} 场匹配活动</p>
              </div>
              <button class="icon-button" type="button" aria-label="下个月" @click="changeMonth(1)">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg>
              </button>
            </div>
            <div class="calendar-weekdays">
              <span v-for="day in weekdays" :key="day">{{ day }}</span>
            </div>
            <div class="calendar-grid">
              <a
                v-for="day in calendarCells"
                :key="day.key"
                :href="\`#/events/\${day.date}\`"
                class="calendar-day"
                :class="{ muted: !day.inMonth, active: day.date === selectedDate, hasEvents: day.count > 0 }"
                :data-calendar-date="day.date"
                @click="selectDate(day.date)"
              >
                <span>{{ day.day }}</span>
                <strong v-if="day.count > 0">{{ day.count }}</strong>
                <small v-if="day.samples.length">{{ day.samples[0].title }}</small>
              </a>
            </div>
          </section>

          <div class="status-tabs" aria-label="活动状态筛选">
            <button
              v-for="item in eventListFilterOptions"
              :key="item.id"
              type="button"
              :class="{ active: eventListFilter === item.id }"
              @click="eventListFilter = item.id"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.count.toLocaleString("ja-JP") }}</strong>
            </button>
          </div>

          <div class="section-head day-head">
            <div>
              <p class="eyebrow">Day events</p>
              <h2>{{ selectedDateLabel }}</h2>
            </div>
            <span class="muted">{{ filteredDayEvents.length.toLocaleString("ja-JP") }} / {{ dayEventTotal.toLocaleString("ja-JP") }} 场</span>
          </div>

          <div class="event-list desktop-event-list">
            <article
              v-for="event in filteredDayEvents"
              :key="event.id"
              class="event-card desktop-event-row clickable-card"
              :class="{ selected: selectedEvent?.sourceEventId === event.sourceEventId }"
              tabindex="0"
              role="button"
              @click="openEventInline(event)"
              @keydown.enter.prevent="openEventInline(event)"
            >
              <div class="desktop-date-cell">
                <strong>{{ compactMonthDay(event.date) }}</strong>
                <span>{{ formatDate(event.date).weekday }}</span>
              </div>
              <div>
                <div class="event-row-title">
                  <span class="tag status-tag">{{ typeLabel(event.type) }}</span>
                  <h3 class="event-title">{{ event.title }}</h3>
                </div>
                <div class="event-meta">
                  <span>{{ displayVenue(event.venue) }}</span>
                  <span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span>
                </div>
              </div>
              <div class="desktop-row-tags">
                <span v-if="event.city" class="tag region-tag">{{ event.city }}</span>
                <span class="tag type-tag">{{ isJoined(event) ? "已参加" : "现场" }}</span>
              </div>
              <div class="desktop-row-status">
                <span :class="isJoined(event) ? 'status-dot joined' : 'status-dot'"></span>
                <strong>{{ isJoined(event) ? "已参加" : eventListStatusLabel(event) }}</strong>
              </div>
              <button class="row-menu-button" type="button" aria-label="更多" @click.stop>⋮</button>
            </article>
            <p v-if="filteredDayEvents.length === 0" class="muted">{{ loading ? "加载中..." : "这一天没有匹配活动。" }}</p>
          </div>
          <p class="muted result-note">日历按月分页，点击日期查看当天所有活动；全量活动仍在后端。</p>
        </div>

        <aside class="desktop-detail-panel" aria-label="活动详情">
          <div v-if="selectedEvent" class="desktop-detail-inner">
            <section class="desktop-detail-hero">
              <div class="desktop-detail-head">
                <span class="tag status-tag">{{ typeLabel(selectedEvent.type) }}</span>
                <button class="ghost-button" type="button" @click="openEvent(selectedEvent)">打开详情</button>
              </div>
              <h2>{{ selectedEvent.title }}</h2>
              <div class="desktop-detail-meta">
                <span>{{ formatDetailDate(selectedEvent.date) }}</span>
                <span>{{ displayVenue(selectedEvent.venue) }}</span>
                <span v-if="eventCardArtistSummary(selectedEvent)">{{ eventCardArtistSummary(selectedEvent) }}</span>
              </div>
              <div class="desktop-keyfacts">
                <div>
                  <span>日期</span>
                  <strong>{{ compactMonthDay(selectedEvent.date) }}</strong>
                </div>
                <div>
                  <span>地区</span>
                  <strong>{{ selectedEvent.city || "未标注" }}</strong>
                </div>
                <div>
                  <span>出演</span>
                  <strong>{{ selectedEvent.artists.length.toLocaleString("ja-JP") }}</strong>
                </div>
              </div>
            </section>

            <section class="desktop-inspector-card">
              <div class="panel-head">
                <h2>我的状态</h2>
                <button class="ghost-button" type="button" @click="authUser ? saveEventNote() : go('profile')">{{ authUser ? "记录" : "登录" }}</button>
              </div>
              <div class="desktop-status-row">
                <span :class="authUser ? 'status-dot warning' : 'status-dot'"></span>
                <strong>{{ authUser ? eventNoteStatusLabel : "登录后管理" }}</strong>
              </div>
              <div class="desktop-status-choices">
                <button
                  v-for="[value, label] in eventNoteStatusOptions.slice(1, 5)"
                  :key="value"
                  type="button"
                  :class="{ active: eventNoteStatus === value }"
                  @click="authUser ? (eventNoteStatus = value, saveEventNote()) : go('profile')"
                >
                  {{ label }}
                </button>
              </div>
              <p class="muted">{{ authUser ? "可记录抽选、购票、座位和同行备注。" : "登录后保存活动状态和备注。" }}</p>
            </section>

            <section v-if="isUpcomingSelectedEvent" class="desktop-inspector-card">
              <div class="panel-head">
                <h2>票务参考</h2>
                <button class="ghost-button" type="button" :disabled="ticketReferenceLoading" @click="loadEventTicketReference(true)">检查</button>
              </div>
              <div class="ticket-reference-mini">
                <span>{{ ticketReference.platform || "TicketJam" }} · {{ ticketReferenceStatusLabel }}</span>
                <strong>{{ ticketReference.minPrice ? ticketReference.minPrice.toLocaleString("ja-JP") + " 円 / 枚" : "暂未取得价格" }}</strong>
                <p>{{ ticketReference.message || "公开页面匹配结果只作为参考，购买前请确认券面条件。" }}</p>
                <a :href="ticketReference.listUrl || ticketReference.searchUrl || selectedEvent.sourceUrl" target="_blank" rel="noreferrer">查看详情</a>
              </div>
            </section>

            <section class="desktop-inspector-card">
              <div class="panel-head">
                <h2>来源信息</h2>
                <a class="ghost-button link-button" :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">查看来源</a>
              </div>
              <div class="source-health">
                <span>{{ selectedEvent.sourceName || "Eventernote" }}</span>
                <strong>信息新鲜度：高</strong>
                <small>{{ eventSourceSummary }}</small>
                <div class="source-meter" aria-label="信息新鲜度高">
                  <i></i><i></i><i></i>
                </div>
              </div>
            </section>

            <section class="desktop-inspector-card desktop-notes-card">
              <div class="panel-head">
                <h2>笔记</h2>
                <button class="ghost-button" type="button" @click="authUser ? openEvent(selectedEvent) : go('profile')">编辑</button>
              </div>
              <p>{{ eventNoteMemo || "同行、座位希望、物贩、交通等可以记录在这里。" }}</p>
            </section>

            <section class="desktop-link-list">
              <button type="button" @click="openEvent(selectedEvent)">
                <span>出演者</span>
                <strong>{{ selectedEvent.artists.length.toLocaleString("ja-JP") }}</strong>
              </button>
              <button v-if="isConcreteWorkTitle(selectedEvent.work)" type="button" @click="openEventWork(selectedEvent)">
                <span>相关作品</span>
                <strong>1</strong>
              </button>
              <button type="button" @click="openEventVenue(selectedEvent)">
                <span>会场信息</span>
                <strong>›</strong>
              </button>
              <button type="button" @click="openEvent(selectedEvent)">
                <span>修正记录</span>
                <strong>{{ eventCorrections.length.toLocaleString("ja-JP") }}</strong>
              </button>
            </section>

            <div class="desktop-detail-actions">
              <button class="ghost-button" type="button" @click="openEvent(selectedEvent)">分享</button>
              <a class="secondary-button link-button" :href="mapUrlForVenue(selectedEvent.venue)" target="_blank" rel="noreferrer">地图</a>
              <a v-if="eventExtra.ticketUrl" class="primary-button link-button" :href="eventExtra.ticketUrl" target="_blank" rel="noreferrer">票务</a>
              <button v-else class="primary-button" type="button" @click="loadEventTicketReference(true)">票务检查</button>
            </div>
          </div>
          <div v-else class="desktop-detail-empty">
            <h2>选择一场活动</h2>
            <p class="muted">左侧列表用于浏览，右侧用于判断是否参加、查票务和记录来源。</p>
          </div>
        </aside>
      </div>
    </section>

    <section v-if="page === 'event'" class="page-view event-detail-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Event detail</p>
          <h1>活动详情</h1>
        </div>
        <button class="ghost-button" type="button" @click="backFromEventDetail">{{ eventBackLabel }}</button>
      </div>

      <section v-if="selectedEvent" class="event-detail-card">
        <section class="decision-strip" aria-label="活动决策摘要">
          <div>
            <span>日期</span>
            <strong>{{ formatDate(selectedEvent.date).month }} {{ formatDate(selectedEvent.date).day }} · {{ formatDate(selectedEvent.date).weekday }}</strong>
          </div>
          <div>
            <span>会场</span>
            <strong>{{ displayVenue(selectedEvent.venue) }}</strong>
          </div>
          <div>
            <span>我的判断</span>
            <strong>{{ authUser ? eventNoteStatusLabel : "登录后管理" }}</strong>
          </div>
        </section>

        <div class="event-detail-main">
          <p class="eyebrow">{{ selectedEvent.status }}</p>
          <h2>{{ selectedEvent.title }}</h2>
          <div class="tag-row">
            <span class="tag status-tag">{{ typeLabel(selectedEvent.type) }}</span>
            <span v-for="tag in eventDisplayTags(selectedEvent)" :key="tag" class="tag">{{ tag }}</span>
          </div>
          <div class="detail-actions detail-actions-primary">
            <button class="primary-button" :class="{ joined: isJoined(selectedEvent) }" type="button" @click="toggleJoin(selectedEvent)">
              {{ authUser ? (isJoined(selectedEvent) ? "已加入我的活动" : "加入我的活动") : "登录后加入" }}
            </button>
            <a v-if="eventExtra.ticketUrl" class="primary-button link-button" :href="eventExtra.ticketUrl" target="_blank" rel="noreferrer">票务</a>
            <a v-if="eventExtra.officialUrl" class="secondary-button link-button" :href="eventExtra.officialUrl" target="_blank" rel="noreferrer">官网</a>
            <a class="secondary-button link-button" :href="mapUrlForVenue(selectedEvent.venue)" target="_blank" rel="noreferrer">地图</a>
          </div>
        </div>

        <section class="action-summary">
          <div>
            <span>我的状态</span>
            <strong>{{ authUser ? eventNoteStatusLabel : "未登录" }}</strong>
            <small>{{ authUser ? "可记录票务、同行、座位和现场注意点" : "登录后保存活动状态和备注" }}</small>
          </div>
          <div>
            <span>行动信息</span>
            <strong>{{ eventExtra.ticketUrl || eventExtra.officialUrl ? "已有链接" : "待补充" }}</strong>
            <small>{{ actionInfoSummary }}</small>
          </div>
          <div>
            <span>数据来源</span>
            <strong>{{ selectedEvent.sourceName || "Eventernote" }}</strong>
            <small>{{ eventSourceSummary }}</small>
          </div>
        </section>

        <div class="detail-grid">
          <div>
            <span>日期</span>
            <strong>{{ formatDetailDate(selectedEvent.date) }}</strong>
          </div>
          <div>
            <span>开场 / 开演</span>
            <strong>{{ eventExtra.openTime || eventExtra.startTime ? (eventExtra.openTime || "未补充") + " / " + (eventExtra.startTime || "未补充") : "未补充" }}</strong>
          </div>
          <div>
            <span>地区</span>
            <strong>{{ selectedEvent.city || "未标注" }}</strong>
          </div>
          <div>
            <span>会场</span>
            <strong>{{ displayVenue(selectedEvent.venue) }}</strong>
          </div>
          <div v-if="isConcreteWorkTitle(selectedEvent.work)">
            <span>作品 / 企划</span>
            <strong>{{ selectedEvent.work }}</strong>
          </div>
          <div>
            <span>出演者</span>
            <strong>{{ selectedEvent.artists.length.toLocaleString("ja-JP") }} 人 / 组</strong>
          </div>
          <div>
            <span>票价</span>
            <strong>{{ eventExtra.price || "未补充" }}</strong>
          </div>
        </div>

        <section v-if="eventExtra.ticketInfo" class="panel detail-section event-extra-panel">
          <div class="panel-head">
            <h2>活动补充</h2>
          </div>
          <p class="event-extra-note">{{ eventExtra.ticketInfo }}</p>
        </section>

        <section v-if="isUpcomingSelectedEvent" class="panel ticket-reference-panel">
          <div class="panel-head">
            <h2>二手票参考</h2>
            <span class="muted">{{ ticketReferenceLoading ? "检查中..." : ticketReferenceCheckedLabel }}</span>
          </div>
          <div class="ticket-reference-card" :class="ticketReference.status">
            <div>
              <span>{{ ticketReference.platform || "TicketJam" }} · {{ ticketReferenceStatusLabel }}</span>
              <strong>{{ ticketReference.minPrice ? ticketReference.minPrice.toLocaleString("ja-JP") + " 円 / 枚" : "暂未取得价格" }}</strong>
              <p>{{ ticketReference.message || "基于公开搜索页的缓存参考，购买前请自行确认票券条件。" }}</p>
              <p v-if="ticketReference.query" class="muted">搜索词：{{ ticketReference.query }}</p>
            </div>
            <div class="ticket-reference-actions">
              <span class="tag">{{ ticketReference.listingCount ? ticketReference.listingCount + " 件匹配" : "未匹配" }}</span>
              <span class="tag">{{ ticketReferenceCacheLabel }}</span>
              <a class="secondary-button link-button" :href="ticketReference.listUrl || ticketReference.searchUrl" target="_blank" rel="noreferrer">打开票酱列表</a>
              <button class="ghost-button" type="button" :disabled="ticketReferenceLoading" @click="loadEventTicketReference(true)">刷新</button>
            </div>
          </div>
          <p class="ticket-trust-note">{{ ticketReferenceTrustNote }}</p>
          <div v-if="ticketReferenceListings.length" class="ticket-listing-list">
            <article v-for="listing in pagedTicketReferenceListings" :key="listing.url || listing.price + listing.title" class="ticket-listing-row">
              <div class="ticket-listing-price">
                <strong>{{ listing.price.toLocaleString("ja-JP") }} 円/枚</strong>
                <span v-if="listing.quantity">{{ listing.quantity }} 枚</span>
              </div>
              <div class="ticket-listing-body">
                <h3>{{ listing.seat || listing.title || "座席未定" }}</h3>
                <p v-if="listing.dateLine" class="muted">{{ listing.dateLine }}</p>
                <p v-if="listing.description">{{ listing.description }}</p>
                <div v-if="listing.tags?.length" class="tag-row">
                  <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
              <a v-if="listing.url" class="ghost-button link-button" :href="listing.url" target="_blank" rel="noreferrer">详情</a>
            </article>
            <div v-if="ticketReferencePageCount > 1" class="ticket-pagination">
              <span class="muted">第 {{ ticketReferencePage }} / {{ ticketReferencePageCount }} 页 · {{ ticketReferenceListings.length }} 条已读取</span>
              <div>
                <button class="ghost-button" type="button" :disabled="ticketReferencePage <= 1" @click="ticketReferencePage -= 1">上一页</button>
                <button class="ghost-button" type="button" :disabled="ticketReferencePage >= ticketReferencePageCount" @click="ticketReferencePage += 1">下一页</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="!authUser" class="panel event-note-panel sign-in-nudge">
          <div>
            <h2>把这场活动加入你的计划</h2>
            <p class="muted">登录后可以标记想去、抽选中、已购票或已参加，并同步到系统日历。</p>
          </div>
          <button class="primary-button" type="button" @click="go('profile')">登录管理</button>
        </section>

        <section v-if="authUser" class="panel event-note-panel">
          <div class="panel-head">
            <h2>我的状态</h2>
            <span class="muted">{{ eventNoteSaveState }}</span>
          </div>
          <form class="event-note-form" @submit.prevent="saveEventNote">
            <label class="search-field">
              <span>状态</span>
              <select v-model="eventNoteStatus">
                <option v-for="[value, label] in eventNoteStatusOptions" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <label class="search-field event-note-memo">
              <span>备注</span>
              <textarea v-model="eventNoteMemo" rows="3" placeholder="票务、同行、交通、座位、现场注意点"></textarea>
            </label>
            <button class="secondary-button" type="submit">保存状态</button>
          </form>
        </section>

        <section class="panel event-community-panel">
          <div class="panel-head">
            <h2>这场活动的大家</h2>
            <span class="muted">{{ interactionSaveState }}</span>
          </div>
          <div class="event-status-grid">
            <div v-for="item in eventStatusStats" :key="item.status">
              <span>{{ item.label }}</span>
              <strong>{{ item.count.toLocaleString("ja-JP") }}</strong>
            </div>
          </div>
        </section>

        <section class="panel event-qa-panel">
          <div class="panel-head">
            <h2>活动问答</h2>
            <span class="muted">{{ eventQuestions.length.toLocaleString("ja-JP") }} 个问题</span>
          </div>
          <form class="event-inline-form" @submit.prevent="submitQuestion">
            <input v-model="questionDraft" placeholder="例如：电子票需要本人确认吗？物贩几点开始？">
            <button class="secondary-button" type="submit">{{ authUser ? "提问" : "登录提问" }}</button>
          </form>
          <div class="qa-list">
            <article v-for="question in eventQuestions" :key="question.id" class="qa-card">
              <div class="qa-head">
                <strong>{{ question.body }}</strong>
                <div class="qa-meta-actions">
                  <span>{{ question.author.displayName }} <em v-if="question.author.isAdmin">管理员</em></span>
                  <button v-if="question.canDelete" class="text-button danger" type="button" @click="deleteQuestion(question)">删除</button>
                </div>
              </div>
              <div v-if="question.answers.length" class="answer-list">
                <div v-for="answer in question.answers" :key="answer.id">
                  <p>{{ answer.body }}</p>
                  <span>
                    {{ answer.author.displayName }} <em v-if="answer.author.isAdmin">管理员</em>
                    <button v-if="answer.canDelete" class="text-button danger" type="button" @click="deleteAnswer(answer)">删除</button>
                  </span>
                </div>
              </div>
              <form class="event-inline-form compact" @submit.prevent="submitAnswer(question)">
                <input v-model="question.answerDraft" placeholder="补充一个回答">
                <button class="ghost-button" type="submit">{{ authUser ? "回答" : "登录回答" }}</button>
              </form>
            </article>
            <p v-if="eventQuestions.length === 0" class="muted">还没有问题。可以从票务、入场、物贩、交通这些点开始问。</p>
          </div>
        </section>

        <section class="panel event-correction-panel">
          <div class="panel-head">
            <div>
              <h2>来源与修正</h2>
              <p class="muted">原站信息、用户补完和管理员确认会集中在这里。</p>
            </div>
            <button class="ghost-button" type="button" @click="showCorrectionPanel = !showCorrectionPanel">
              {{ showCorrectionPanel ? "收起" : "提交 / 查看" }}
            </button>
          </div>
          <div class="source-trust-row">
            <span>{{ selectedEvent.sourceName || "Eventernote" }}</span>
            <strong>{{ selectedEvent.verifiedAt ? "确认于 " + selectedEvent.verifiedAt : "确认日期未标注" }}</strong>
            <a :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">打开原始页面</a>
          </div>
          <form v-if="showCorrectionPanel" class="correction-form" @submit.prevent="submitCorrection">
            <label class="search-field">
              <span>字段</span>
              <select v-model="correctionField">
                <option v-for="[value, label] in correctionFieldOptions" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <label class="search-field">
              <span>建议内容</span>
              <input v-model="correctionValue" placeholder="正确会场、时间、票务信息等">
            </label>
            <label class="search-field">
              <span>来源 URL</span>
              <input v-model="correctionSourceUrl" placeholder="https://">
            </label>
            <label class="search-field correction-note-field">
              <span>说明</span>
              <input v-model="correctionNote" placeholder="为什么这样改">
            </label>
            <button class="secondary-button" type="submit">{{ authUser ? "提交纠错" : "登录提交" }}</button>
          </form>
          <div v-if="showCorrectionPanel || eventCorrections.length" class="correction-list">
            <article v-for="correction in eventCorrections" :key="correction.id" class="correction-card" :class="correction.status">
              <div>
                <span>{{ correction.fieldLabel }}</span>
                <strong>{{ correction.value }}</strong>
                <p v-if="correction.note">{{ correction.note }}</p>
                <a v-if="correction.sourceUrl" :href="correction.sourceUrl" target="_blank" rel="noreferrer">来源</a>
              </div>
              <div class="correction-actions">
                <span class="tag">{{ correctionStatusLabel(correction.status) }}</span>
                <button class="ghost-button" type="button" :disabled="correction.confirmedByMe" @click="confirmCorrection(correction)">
                  {{ correction.confirmationCount.toLocaleString("ja-JP") }} 人确认
                </button>
                <button v-if="canReviewCorrections && correction.status === 'pending'" class="secondary-button" type="button" @click="reviewCorrection(correction, 'confirmed')">确认</button>
                <button v-if="canReviewCorrections && correction.status === 'pending'" class="ghost-button" type="button" @click="reviewCorrection(correction, 'rejected')">驳回</button>
                <button v-if="correction.canHide" class="ghost-button danger" type="button" @click="hideCorrection(correction)">隐藏</button>
              </div>
            </article>
            <p v-if="showCorrectionPanel && eventCorrections.length === 0" class="muted">还没有纠错记录。用户提交后可由其他人确认，管理员可最终确认或驳回。</p>
          </div>
        </section>

        <section class="panel detail-section">
          <div class="panel-head">
            <h2>出演者</h2>
            <span class="muted">{{ selectedEvent.artists.length.toLocaleString("ja-JP") }} 人 / 组</span>
          </div>
          <div class="performer-list">
            <button v-for="artist in visibleEventArtists" :key="artist" type="button" @click="openArtistByName(artist)">
              {{ artist }}
            </button>
          </div>
          <button v-if="selectedEvent.artists.length > collapsedArtistLimit" class="ghost-button performer-toggle" type="button" @click="showAllEventArtists = !showAllEventArtists">
            {{ showAllEventArtists ? "收起出演者" : "展开全部 " + selectedEvent.artists.length.toLocaleString("ja-JP") + " 人 / 组" }}
          </button>
        </section>

        <div class="detail-actions">
          <a class="primary-button link-button" :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">打开 Eventernote</a>
          <button v-if="isConcreteWorkTitle(selectedEvent.work)" class="ghost-button" type="button" @click="openEventWork(selectedEvent)">同作品活动</button>
          <button class="ghost-button" type="button" @click="showCorrectionPanel = true">修正信息</button>
        </div>

      </section>

      <div v-if="selectedEvent" class="mobile-decision-bar" aria-label="移动端活动操作">
        <button class="primary-button" :class="{ joined: isJoined(selectedEvent) }" type="button" @click="toggleJoin(selectedEvent)">
          {{ authUser ? (isJoined(selectedEvent) ? "已加入" : "想去") : "登录" }}
        </button>
        <a class="secondary-button link-button" :href="mapUrlForVenue(selectedEvent.venue)" target="_blank" rel="noreferrer">地图</a>
        <a v-if="eventExtra.ticketUrl" class="ghost-button link-button" :href="eventExtra.ticketUrl" target="_blank" rel="noreferrer">票务</a>
        <a v-else class="ghost-button link-button" :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">原站</a>
      </div>

      <section v-else class="panel">
        <h2>还没有选择活动</h2>
        <p class="muted">请从活动日历或首页活动列表进入详情。</p>
        <button class="primary-button" type="button" @click="go('events')">去活动页</button>
      </section>
    </section>

    <section v-if="page === 'artists'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Cast directory</p>
          <h1>出演者</h1>
        </div>
      </div>
      <form class="directory-search" @submit.prevent>
        <label class="search-field">
          <span>搜索出演者</span>
          <div class="search-input-wrap">
            <input v-model="directoryQuery" type="search" placeholder="水瀬いのり、雨宮天、内田真礼" @focus="showDirectorySuggestions = true" @keydown.enter="hideSuggestions" @change="hideSuggestions" @blur="hideSuggestionsSoon">
            <button v-if="directoryQuery" class="clear-search-button" type="button" aria-label="清空搜索" @click="directoryQuery = ''">x</button>
            <div v-if="showDirectorySuggestions && directorySuggestions.length" class="suggestion-list">
              <button v-for="suggestion in directorySuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyDirectorySuggestion(suggestion)">
                {{ suggestion }}
              </button>
            </div>
          </div>
        </label>
      </form>
      <div class="directory-list">
          <article v-for="artist in visibleArtists" :key="artist.name" class="profile-card clickable-card" @click="openArtist(artist)">
            <span class="avatar large">{{ artist.name.slice(0, 1) }}</span>
            <div>
              <h2>{{ artist.name }}</h2>
              <p class="muted">{{ artist.role }}</p>
              <p>{{ artist.follows.toLocaleString("ja-JP") }} 条相关活动</p>
            </div>
          </article>
      </div>
    </section>

    <section v-if="page === 'works'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Works directory</p>
          <h1>作品 / 企划</h1>
        </div>
      </div>
      <form class="directory-search" @submit.prevent>
        <label class="search-field">
          <span>搜索作品 / 企划</span>
          <div class="search-input-wrap">
            <input v-model="directoryQuery" type="search" placeholder="ラブライブ、アイドルマスター、AnimeJapan" @focus="showDirectorySuggestions = true" @keydown.enter="hideSuggestions" @change="hideSuggestions" @blur="hideSuggestionsSoon">
            <button v-if="directoryQuery" class="clear-search-button" type="button" aria-label="清空搜索" @click="directoryQuery = ''">x</button>
            <div v-if="showDirectorySuggestions && directorySuggestions.length" class="suggestion-list">
              <button v-for="suggestion in directorySuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyDirectorySuggestion(suggestion)">
                {{ suggestion }}
              </button>
            </div>
          </div>
        </label>
      </form>
      <div class="card-grid">
          <article v-for="work in visibleWorks" :key="work.title" class="work-card clickable-card" @click="openWork(work)">
            <h2>{{ work.title }}</h2>
            <p>{{ work.trend }}</p>
            <strong>{{ work.events.toLocaleString("ja-JP") }} 场活动</strong>
          </article>
      </div>
    </section>

    <section v-if="page === 'venues'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Venue directory</p>
          <h1>会场</h1>
        </div>
      </div>
      <form class="directory-search" @submit.prevent>
        <label class="search-field">
          <span>搜索会场</span>
          <div class="search-input-wrap">
            <input v-model="directoryQuery" type="search" placeholder="横浜アリーナ、東京ドーム、Zepp" @focus="showDirectorySuggestions = true" @keydown.enter="hideSuggestions" @change="hideSuggestions" @blur="hideSuggestionsSoon">
            <button v-if="directoryQuery" class="clear-search-button" type="button" aria-label="清空搜索" @click="directoryQuery = ''">x</button>
            <div v-if="showDirectorySuggestions && directorySuggestions.length" class="suggestion-list">
              <button v-for="suggestion in directorySuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyDirectorySuggestion(suggestion)">
                {{ suggestion }}
              </button>
            </div>
          </div>
        </label>
      </form>
      <div class="venue-table">
          <button v-for="venue in visibleVenues" :key="venue.id" type="button" class="venue-card clickable-card" @click="openVenue(venue)">
            <strong>{{ displayVenue(venue.name) }}</strong>
            <span>{{ venue.area }}</span>
            <em>{{ venue.events.toLocaleString("ja-JP") }} 场</em>
          </button>
      </div>
    </section>

    <section v-if="page === 'artist'" class="page-view event-detail-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Artist detail</p>
          <h1>出演者详情</h1>
        </div>
        <button class="ghost-button" type="button" @click="go('artists')">返回出演者</button>
      </div>
      <template v-if="selectedArtist">
      <section class="detail-hero-card">
        <div class="event-detail-main">
          <p class="eyebrow">{{ selectedArtist.role }}</p>
          <h2>{{ selectedArtist.name }}</h2>
        </div>
        <button class="secondary-button" :class="{ joined: isEntityFavorite('artists', selectedArtist.name) }" type="button" @click="toggleEntityFavorite('artists', selectedArtist.name)">
          {{ authUser ? (isEntityFavorite('artists', selectedArtist.name) ? "取消关注" : "关注出演者") : "登录后关注" }}
        </button>
      </section>
      <section class="detail-grid">
        <div>
          <span>相关活动</span>
          <strong>{{ artistHistoricalTotal.toLocaleString("ja-JP") }}</strong>
        </div>
        <div>
          <span>资料来源</span>
          <strong>Eventernote 出演者索引</strong>
        </div>
      </section>
      <section class="panel detail-section">
        <div class="panel-head">
          <h2>活动时间线</h2>
          <span class="muted">已载入 {{ relatedEvents.length.toLocaleString("ja-JP") }} / {{ relatedEventTotal.toLocaleString("ja-JP") }} 场</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div v-if="relatedEvents.length" class="related-timeline-groups">
          <section v-for="group in relatedEventSections" :key="group.id" v-show="group.total > 0" class="related-timeline-group" :class="{ collapsed: group.collapsed }">
            <button class="timeline-group-head" type="button" @click="toggleRelatedSection(group.id)">
              <span class="collapse-mark">{{ group.collapsed ? "+" : "-" }}</span>
              <h3>{{ group.label }}</h3>
              <span>已载入 {{ group.items.length.toLocaleString("ja-JP") }} / {{ group.total.toLocaleString("ja-JP") }} 场</span>
            </button>
            <div v-if="!group.collapsed" class="event-list compact">
              <article v-for="event in group.items" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
                <div class="date-box timeline-date-box">
                  <div>
                    <small>{{ event.date.slice(0, 4) }}</small>
                    <span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span>
                    <strong>{{ formatDate(event.date).day }}</strong>
                  </div>
                </div>
                <div>
                  <h3 class="event-title">{{ event.title }}</h3>
                  <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span></div>
                  <div v-if="eventCardTags(event).length" class="tag-row">
                    <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                  </div>
                </div>
              </article>
            </div>
            <div v-if="!group.collapsed && group.hasMore" class="timeline-more">
              <button class="secondary-button" type="button" :disabled="loadingRelated" @click="loadMoreRelatedEvents(group.id)">
                {{ loadingRelated ? "加载中..." : "加载更多" + group.label }}
              </button>
            </div>
          </section>
        </div>
        <p v-if="!relatedEvents.length" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
      </section>
      </template>
      <section v-else class="panel">
        <h2>还没有选择出演者</h2>
        <button class="primary-button" type="button" @click="go('artists')">去出演者列表</button>
      </section>
    </section>

    <section v-if="page === 'work'" class="page-view event-detail-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Work detail</p>
          <h1>作品详情</h1>
        </div>
        <button class="ghost-button" type="button" @click="go('works')">返回作品</button>
      </div>
      <template v-if="selectedWork">
      <section class="detail-hero-card">
        <div class="event-detail-main">
          <p class="eyebrow">{{ selectedWork.category }}</p>
          <h2>{{ selectedWork.title }}</h2>
          <p class="muted">{{ selectedWork.trend }}</p>
        </div>
        <button class="secondary-button" :class="{ joined: isEntityFavorite('works', selectedWork.title) }" type="button" @click="toggleEntityFavorite('works', selectedWork.title)">
          {{ authUser ? (isEntityFavorite('works', selectedWork.title) ? "取消关注" : "关注作品") : "登录后关注" }}
        </button>
      </section>
      <section class="detail-grid">
        <div>
          <span>历史活动</span>
          <strong>{{ selectedWork.events.toLocaleString("ja-JP") }}</strong>
        </div>
      </section>
      <section class="panel detail-section">
        <div class="panel-head">
          <h2>活动时间线</h2>
          <span class="muted">已载入 {{ relatedEvents.length.toLocaleString("ja-JP") }} / {{ relatedEventTotal.toLocaleString("ja-JP") }} 场</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div v-if="relatedEvents.length" class="related-timeline-groups">
          <section v-for="group in relatedEventSections" :key="group.id" v-show="group.total > 0" class="related-timeline-group" :class="{ collapsed: group.collapsed }">
            <button class="timeline-group-head" type="button" @click="toggleRelatedSection(group.id)">
              <span class="collapse-mark">{{ group.collapsed ? "+" : "-" }}</span>
              <h3>{{ group.label }}</h3>
              <span>已载入 {{ group.items.length.toLocaleString("ja-JP") }} / {{ group.total.toLocaleString("ja-JP") }} 场</span>
            </button>
            <div v-if="!group.collapsed" class="event-list compact">
              <article v-for="event in group.items" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
                <div class="date-box timeline-date-box">
                  <div>
                    <small>{{ event.date.slice(0, 4) }}</small>
                    <span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span>
                    <strong>{{ formatDate(event.date).day }}</strong>
                  </div>
                </div>
                <div>
                  <h3 class="event-title">{{ event.title }}</h3>
                  <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span></div>
                  <div v-if="eventCardTags(event).length" class="tag-row">
                    <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                  </div>
                </div>
              </article>
            </div>
            <div v-if="!group.collapsed && group.hasMore" class="timeline-more">
              <button class="secondary-button" type="button" :disabled="loadingRelated" @click="loadMoreRelatedEvents(group.id)">
                {{ loadingRelated ? "加载中..." : "加载更多" + group.label }}
              </button>
            </div>
          </section>
        </div>
        <p v-if="!relatedEvents.length" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
      </section>
      </template>
      <section v-else class="panel">
        <h2>还没有选择作品</h2>
        <button class="primary-button" type="button" @click="go('works')">去作品列表</button>
      </section>
    </section>

    <section v-if="page === 'venue'" class="page-view event-detail-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Venue detail</p>
          <h1>会场详情</h1>
        </div>
        <button class="ghost-button" type="button" @click="go('venues')">返回会场</button>
      </div>
      <template v-if="selectedVenue">
      <section class="detail-hero-card">
        <div class="event-detail-main">
          <p class="eyebrow">{{ selectedVenue.area }}</p>
          <h2>{{ displayVenue(selectedVenue.name) }}</h2>
        </div>
        <button class="secondary-button" :class="{ joined: isEntityFavorite('venues', selectedVenue.id) }" type="button" @click="toggleEntityFavorite('venues', selectedVenue.id)">
          {{ authUser ? (isEntityFavorite('venues', selectedVenue.id) ? "取消关注" : "关注会场") : "登录后关注" }}
        </button>
      </section>
      <section class="detail-grid">
        <div>
          <span>历史活动</span>
          <strong>{{ venueHistoricalTotal.toLocaleString("ja-JP") }}</strong>
        </div>
        <div>
          <span>会场来源</span>
          <strong>Eventernote place_id</strong>
        </div>
      </section>
      <div class="detail-actions">
        <a v-if="selectedVenue.sourceUrl" class="ghost-button link-button" :href="selectedVenue.sourceUrl" target="_blank" rel="noreferrer">打开来源</a>
        <a class="secondary-button link-button" :href="mapUrlForVenue(selectedVenue.name)" target="_blank" rel="noreferrer">打开地图</a>
      </div>
      <section class="panel detail-section">
        <div class="panel-head">
          <h2>活动时间线</h2>
          <span class="muted">已载入 {{ relatedEvents.length.toLocaleString("ja-JP") }} / {{ relatedEventTotal.toLocaleString("ja-JP") }} 场</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div v-if="relatedEvents.length" class="related-timeline-groups">
          <section v-for="group in relatedEventSections" :key="group.id" v-show="group.total > 0" class="related-timeline-group" :class="{ collapsed: group.collapsed }">
            <button class="timeline-group-head" type="button" @click="toggleRelatedSection(group.id)">
              <span class="collapse-mark">{{ group.collapsed ? "+" : "-" }}</span>
              <h3>{{ group.label }}</h3>
              <span>已载入 {{ group.items.length.toLocaleString("ja-JP") }} / {{ group.total.toLocaleString("ja-JP") }} 场</span>
            </button>
            <div v-if="!group.collapsed" class="event-list compact">
              <article v-for="event in group.items" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
                <div class="date-box timeline-date-box">
                  <div>
                    <small>{{ event.date.slice(0, 4) }}</small>
                    <span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span>
                    <strong>{{ formatDate(event.date).day }}</strong>
                  </div>
                </div>
                <div>
                  <h3 class="event-title">{{ event.title }}</h3>
                  <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span></div>
                  <div v-if="eventCardTags(event).length" class="tag-row">
                    <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                  </div>
                </div>
              </article>
            </div>
            <div v-if="!group.collapsed && group.hasMore" class="timeline-more">
              <button class="secondary-button" type="button" :disabled="loadingRelated" @click="loadMoreRelatedEvents(group.id)">
                {{ loadingRelated ? "加载中..." : "加载更多" + group.label }}
              </button>
            </div>
          </section>
        </div>
        <p v-if="!relatedEvents.length" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
      </section>
      </template>
      <section v-else class="panel">
        <h2>还没有选择会场</h2>
        <button class="primary-button" type="button" @click="go('venues')">去会场列表</button>
      </section>
    </section>

    <section v-if="page === 'favorites'" class="page-view favorites-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">My events</p>
          <h1>我的活动</h1>
        </div>
        <button v-if="authUser && favoriteItems.length > 0" class="ghost-button" type="button" @click="go('events')">找活动</button>
      </div>

      <section v-if="!authUser" class="panel empty-state">
        <h2>登录后查看我的活动</h2>
        <p class="muted">收藏活动、关注出演者和作品后，会在这里汇总成你的参战计划。</p>
        <div class="empty-feature-grid">
          <div><strong>状态管理</strong><span>想去、抽选中、已购票、已参加</span></div>
          <div><strong>日历同步</strong><span>把收藏活动订阅到手机系统日历</span></div>
          <div><strong>关注追踪</strong><span>按出演者、作品和会场汇总新活动</span></div>
        </div>
        <button class="primary-button" type="button" @click="go('profile')">去登录</button>
      </section>

      <div v-if="authUser" class="my-tabs" role="tablist" aria-label="我的页面分区">
        <button type="button" :class="{ active: mySection === 'overview' }" @click="mySection = 'overview'">总览</button>
        <button type="button" :class="{ active: mySection === 'calendar' }" @click="mySection = 'calendar'">日历</button>
        <button type="button" :class="{ active: mySection === 'follows' }" @click="mySection = 'follows'">关注</button>
      </div>

      <section v-if="authUser && mySection !== 'follows' && favoriteItems.length > 0" class="favorite-filter-bar">
        <label class="search-field">
          <span>状态</span>
          <select v-model="favoriteStatusFilter">
            <option value="all">全部状态</option>
            <option v-for="[value, label] in eventNoteStatusOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="search-field">
          <span>时间</span>
          <select v-model="favoritePeriodFilter">
            <option value="all">全部时间</option>
            <option value="upcoming">未开活动</option>
            <option value="ended">已结束</option>
          </select>
        </label>
        <label class="search-field">
          <span>地区</span>
          <select v-model="favoriteAreaFilter">
            <option value="all">全部地区</option>
            <option v-for="area in favoriteAreaOptions" :key="area" :value="area">{{ area }}</option>
          </select>
        </label>
        <button class="ghost-button" type="button" @click="resetFavoriteFilters">重置</button>
      </section>

      <section v-if="authUser && mySection === 'follows'" class="panel follow-panel">
        <div class="panel-head">
          <h2>关注</h2>
          <span class="muted">{{ followedEntityCount }} 个收藏对象</span>
        </div>
        <div class="follow-grid">
          <section>
            <h3>出演者</h3>
            <button v-for="artist in favoriteArtists" :key="artist.name" type="button" @click="openArtist(artist)">{{ artist.name }}</button>
            <p v-if="favoriteArtists.length === 0" class="muted">还没有关注出演者。</p>
          </section>
          <section>
            <h3>作品</h3>
            <button v-for="work in favoriteWorks" :key="work.title" type="button" @click="openWork(work)">{{ work.title }}</button>
            <p v-if="favoriteWorks.length === 0" class="muted">还没有关注作品。</p>
          </section>
          <section>
            <h3>会场</h3>
            <button v-for="venue in favoriteVenues" :key="venue.id" type="button" @click="openVenue(venue)">{{ displayVenue(venue.name) }}</button>
            <p v-if="favoriteVenues.length === 0" class="muted">还没有关注会场。</p>
          </section>
        </div>
      </section>

      <section v-if="authUser && mySection === 'overview'" class="favorite-overview">
        <section class="dashboard compact-stats">
          <div class="metric"><span>筛选结果</span><strong>{{ favoriteFilteredItems.length.toLocaleString("ja-JP") }}</strong></div>
          <div class="metric"><span>计划中</span><strong>{{ favoritePlanningCount.toLocaleString("ja-JP") }}</strong></div>
          <div class="metric"><span>已完成/放弃</span><strong>{{ favoriteDoneCount.toLocaleString("ja-JP") }}</strong></div>
        </section>

        <section v-if="favoriteItems.length === 0" class="panel empty-state">
          <h2>还没有收藏活动</h2>
          <p class="muted">在活动详情页点“加入我的活动”，这里会展示全部收藏活动。</p>
          <button class="primary-button" type="button" @click="go('events')">浏览活动</button>
        </section>

        <section v-for="group in favoriteStatusGroups" :key="group.status" class="panel favorite-overview-section">
          <div class="panel-head">
            <h2>{{ group.label }}</h2>
            <span class="muted">{{ group.items.length.toLocaleString("ja-JP") }} 场</span>
          </div>
          <div class="event-list compact">
            <article v-for="event in group.items" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
              <div class="date-box">
                <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
              </div>
              <div>
                <h3 class="event-title">{{ event.title }}</h3>
                <div class="event-meta">
                  <span>{{ displayVenue(event.venue) }}</span>
                  <span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span>
                </div>
                <div v-if="eventCardTags(event).length" class="tag-row">
                  <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                </div>
              </div>
              <button class="secondary-button join-button joined" type="button" @click.stop="toggleJoin(event)">取消</button>
            </article>
          </div>
        </section>
      </section>

      <section v-if="authUser && mySection === 'calendar' && favoriteItems.length === 0" class="panel empty-state">
        <h2>还没有收藏活动</h2>
        <p class="muted">在活动详情页点“加入我的活动”，这里会自动按日期汇总，并可生成系统日历订阅。</p>
        <div class="empty-feature-grid">
          <div><strong>先找活动</strong><span>从日历筛选日期、地区和类型</span></div>
          <div><strong>再做判断</strong><span>看出演者、会场、票务和官网</span></div>
          <div><strong>最后管理</strong><span>记录票务状态、备注和日程</span></div>
        </div>
        <button class="primary-button" type="button" @click="go('events')">浏览活动</button>
      </section>

      <section v-if="authUser && mySection === 'calendar' && favoriteItems.length > 0" class="favorite-layout">
        <section class="calendar-panel favorite-calendar-panel">
          <div class="calendar-head">
            <button class="icon-button" type="button" aria-label="上个月" @click="changeFavoriteMonth(-1)">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <div>
              <p class="eyebrow">Saved events</p>
              <div class="calendar-title-row">
                <label class="compact-year-select" aria-label="选择收藏月份">
                  <select :value="favoriteMonth" @change="setFavoriteMonth($event.target.value)">
                    <option v-for="month in favoriteMonthOptions" :key="month" :value="month">{{ monthLabel(month) }}</option>
                  </select>
                </label>
              </div>
              <p class="muted">本月 {{ favoriteMonthTotal }} 场收藏</p>
            </div>
            <button class="icon-button" type="button" aria-label="下个月" @click="changeFavoriteMonth(1)">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
          </div>
          <div class="calendar-weekdays">
            <span v-for="day in weekdays" :key="day">{{ day }}</span>
          </div>
          <div class="calendar-grid favorite-calendar-grid">
            <button
              v-for="day in favoriteCalendarCells"
              :key="day.key"
              class="calendar-day favorite-calendar-day"
              :class="{ muted: !day.inMonth, active: day.date === favoriteSelectedDate, hasEvents: day.count > 0 }"
              type="button"
              @click="selectFavoriteDate(day.date)"
            >
              <span>{{ day.day }}</span>
              <strong v-if="day.count > 0">{{ day.count }}</strong>
              <small v-if="day.samples.length">{{ day.samples[0].title }}</small>
            </button>
          </div>
        </section>

        <section class="panel calendar-sync-panel">
          <div>
            <h2>系统日历同步</h2>
            <p class="muted">把已收藏活动同步到手机系统日历。</p>
          </div>
          <div class="calendar-sync-actions">
            <a v-if="calendarFeedUrl" class="secondary-button link-button" :href="calendarWebcalUrl || calendarFeedUrl">订阅</a>
            <a v-if="calendarFeedUrl" class="ghost-button link-button" :href="calendarFeedUrl" download="otakuevents.ics">下载 .ics</a>
            <button v-else class="secondary-button" type="button" @click="loadCalendarFeed">生成链接</button>
          </div>
        </section>

        <section class="favorite-timeline">
          <div class="section-head day-head">
            <div>
              <p class="eyebrow">Saved events</p>
              <h2>{{ favoriteSelectedDateLabel }}</h2>
            </div>
            <span class="muted">{{ selectedFavoriteItems.length }} 场</span>
          </div>
          <p v-if="selectedFavoriteItems.length === 0" class="panel muted">这一天没有收藏活动。</p>
          <div v-else class="event-list compact">
            <article v-for="event in selectedFavoriteItems" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
              <div class="date-box">
                <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
              </div>
              <div>
                <h3 class="event-title">{{ event.title }}</h3>
                <div class="event-meta">
                  <span>{{ displayVenue(event.venue) }}</span>
                  <span v-if="eventCardArtistSummary(event)">{{ eventCardArtistSummary(event) }}</span>
                </div>
                <div v-if="eventCardTags(event).length" class="tag-row">
                  <span v-for="tag in eventCardTags(event)" :key="tag.label" class="tag" :class="tag.className">{{ tag.label }}</span>
                </div>
              </div>
              <button class="secondary-button join-button joined" type="button" @click.stop="toggleJoin(event)">取消</button>
            </article>
          </div>
        </section>
      </section>
    </section>

    <section v-if="page === 'profile'" class="page-view profile-page" :class="{ 'profile-edit-page': isProfileEditPage }">
      <div class="page-title">
        <div>
          <p class="eyebrow">{{ isProfileEditPage ? "Profile editor" : "Profile" }}</p>
          <h1>{{ isProfileEditPage ? "编辑个人主页" : "个人资料" }}</h1>
        </div>
        <button v-if="isProfileEditPage" class="ghost-button" type="button" @click="go('profile')">返回主页</button>
        <button v-else class="ghost-button" type="button" @click="go('favorites')">回到我的</button>
      </div>

      <section v-if="!authUser" class="panel auth-panel">
        <div class="panel-head">
          <h2>{{ authMode === "login" ? "登录" : "创建账号" }}</h2>
          <div class="auth-switch">
            <button type="button" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">登录</button>
            <button type="button" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">注册</button>
          </div>
        </div>
        <form class="auth-form" @submit.prevent="submitAuth">
          <label class="search-field">
            <span>用户名</span>
            <input v-model="authUsername" autocomplete="username" placeholder="event_user">
          </label>
          <label v-if="authMode === 'register'" class="search-field">
            <span>显示名</span>
            <input v-model="authDisplayName" autocomplete="name" placeholder="活动记录者">
          </label>
          <label class="search-field">
            <span>密码</span>
            <input v-model="authPassword" type="password" autocomplete="current-password" placeholder="至少 8 位">
          </label>
          <p v-if="authError" class="load-error">{{ authError }}</p>
          <button class="primary-button" type="submit" :disabled="authLoading">
            {{ authLoading ? "处理中..." : authMode === "login" ? "登录" : "创建账号" }}
          </button>
        </form>
        <div class="auth-benefits">
          <div><strong>我的活动</strong><span>收藏后按日期自动成表</span></div>
          <div><strong>参战状态</strong><span>记录抽选、购票和备注</span></div>
          <div><strong>日历订阅</strong><span>同步到手机或桌面日历</span></div>
        </div>
      </section>

      <template v-else>
        <section v-if="!isProfileEditPage" class="profile-link-card">
          <div class="profile-cover">
            <span class="avatar profile-avatar">
              <img v-if="profileAvatarUrl" :src="profileAvatarUrl" alt="个人头像">
              <span v-else>{{ profileDisplayName.slice(0, 1) || authUser.displayName.slice(0, 1) }}</span>
            </span>
            <div>
              <p class="eyebrow">Activity profile</p>
              <h2>{{ profileDisplayName || authUser.displayName }}</h2>
              <p class="profile-handle">@{{ authUser.username }}</p>
            </div>
            <div class="profile-cover-actions">
              <a v-if="publicProfileUrl" class="secondary-button link-button" :href="publicProfileUrl" target="_blank" rel="noreferrer">查看公开主页</a>
              <button class="primary-button" type="button" @click="openProfileEditor">编辑主页</button>
              <button class="secondary-button" type="button" @click="logout" :disabled="authLoading">退出登录</button>
            </div>
          </div>
          <div v-if="profileCoverUrl" class="profile-cover-image">
            <img :src="profileCoverUrl" alt="个人主页封面">
          </div>
          <p class="profile-status">{{ profileStatusLine || "编辑一句话状态，让这里更像你的活动主页。" }}</p>
          <p class="profile-bio">{{ profileBio || "写下喜欢的活动、声优、作品，或最近的参战计划。" }}</p>
          <div class="profile-chip-row">
            <span v-if="profileHomeArea">常驻 {{ profileHomeArea }}</span>
            <span>{{ typeLabel(profileFavoriteType) }}</span>
            <span>{{ favoriteItems.length.toLocaleString("ja-JP") }} 个活动</span>
            <span>{{ followedEntityCount.toLocaleString("ja-JP") }} 个关注</span>
          </div>
          <div class="profile-tag-row">
            <span v-for="tag in profileTagRows" :key="tag">{{ tag }}</span>
            <span v-if="profileTagRows.length === 0">#声优活动</span>
            <span v-if="profileTagRows.length === 0">#Live</span>
            <span v-if="profileTagRows.length === 0">#遠征計画</span>
          </div>
          <div class="profile-link-list">
            <a v-for="link in profileLinkRows" :key="link.url" :href="link.url" target="_blank" rel="noreferrer">
              <strong>{{ link.label }}</strong>
              <span>{{ link.url }}</span>
            </a>
            <div v-if="profileLinkRows.length === 0" class="profile-link-placeholder">
              <strong>外部链接</strong>
              <span>X / Instagram / YouTube / GitHub / 个人站，都可以在下方编辑。</span>
            </div>
          </div>
          <div class="profile-contact-list">
            <button v-for="contact in profileContactRows" :key="contact.label + contact.value" type="button" @click="copyProfileContact(contact.value)">
              <strong>{{ contact.label }}</strong>
              <span>{{ contact.value }}</span>
            </button>
            <p v-if="profileContactRows.length === 0" class="muted">可以添加 QQ、邮箱、P-ID 或其他常用联系方式。</p>
          </div>
          <p v-if="profileCopyState" class="copy-state">{{ profileCopyState }}</p>
        </section>

        <section v-if="!isProfileEditPage" class="profile-dashboard">
          <section class="profile-summary">
            <div class="metric"><span>收藏活动</span><strong>{{ favoriteItems.length.toLocaleString("ja-JP") }}</strong></div>
            <div class="metric"><span>关注对象</span><strong>{{ followedEntityCount.toLocaleString("ja-JP") }}</strong></div>
            <div class="metric"><span>即将到来</span><strong>{{ upcomingFavoriteItems.length.toLocaleString("ja-JP") }}</strong></div>
          </section>
          <section class="panel profile-preview-section">
            <div class="panel-head">
              <h2>活动身份</h2>
            </div>
            <div class="profile-identity-grid">
              <div>
                <span>下一场计划</span>
                <strong>{{ nextPlanLabel }}</strong>
              </div>
              <div>
                <span>偏好类型</span>
                <strong>{{ typeLabel(profileFavoriteType) }}</strong>
              </div>
              <div>
                <span>常驻地区</span>
                <strong>{{ profileHomeArea || "未设置" }}</strong>
              </div>
            </div>
          </section>
          <section class="panel profile-preview-section">
            <div class="panel-head">
              <h2>兴趣与推し</h2>
            </div>
            <div v-if="profileInterestGroups.length" class="profile-interest-tabs" role="tablist" aria-label="兴趣分类">
              <button
                v-for="group in profileInterestGroups"
                :key="group.category"
                type="button"
                :class="{ active: (activeProfileInterest || profileInterestGroups[0]?.category) === group.category }"
                @click="activeProfileInterest = group.category"
              >
                {{ group.category }}
              </button>
            </div>
            <div v-if="activeProfileInterestItems.length" class="profile-interest-grid">
              <article v-for="item in activeProfileInterestItems" :key="item.category + item.title" class="profile-interest-card">
                <div v-if="item.imageUrl" class="profile-interest-media">
                  <img :src="item.imageUrl" :alt="item.title">
                </div>
                <span>{{ item.category }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ item.note || "还没有说明。" }}</p>
              </article>
            </div>
            <div v-else class="profile-link-placeholder">
              <strong>兴趣展示</strong>
              <span>把喜欢的作品、声优、角色、歌手或会场加进来，个人主页会按分类展示。</span>
            </div>
          </section>
        </section>

        <section v-if="isProfileEditPage" class="panel profile-settings profile-editor">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Profile settings</p>
              <h2>主页内容</h2>
            </div>
            <div class="editor-actions">
              <span class="muted">{{ profileSaveState }}</span>
              <button class="ghost-button" type="button" @click="go('profile')">取消</button>
            </div>
          </div>
          <form class="profile-form" @submit.prevent>
            <label class="search-field">
              <span>昵称</span>
              <input v-model="profileDisplayName" autocomplete="name" placeholder="活动记录者">
            </label>
            <label class="search-field">
              <span>常驻地区</span>
              <input v-model="profileHomeArea" placeholder="东京 / 神奈川 / 大阪">
            </label>
            <label class="search-field">
              <span>一句话状态</span>
              <input v-model="profileStatusLine" placeholder="5月远征计划整理中">
            </label>
            <label class="search-field">
              <span>头像图片 URL</span>
              <input v-model="profileAvatarUrl" placeholder="https://example.com/avatar.jpg">
            </label>
            <label class="search-field">
              <span>封面图片 URL</span>
              <input v-model="profileCoverUrl" placeholder="https://example.com/cover.jpg">
            </label>
            <label class="search-field">
              <span>偏好类型</span>
              <select v-model="profileFavoriteType">
                <option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <label class="search-field profile-bio-field">
              <span>主页介绍</span>
              <textarea v-model="profileBio" rows="3" placeholder="喜欢的声优、作品、活动风格"></textarea>
            </label>
            <section class="profile-bio-field profile-visibility-panel">
              <div>
                <span class="field-label">公开主页</span>
                <p class="muted">控制别人打开你的公开主页时能看到哪些内容。联系方式 / 社交平台默认不公开，打开后才展示。</p>
              </div>
              <div class="profile-visibility-grid">
                <label><input v-model="profileVisibilityEnabled" type="checkbox"> 启用公开主页</label>
                <label><input v-model="profileVisibilityStats" type="checkbox"> 公开活动统计</label>
                <label><input v-model="profileVisibilityLinks" type="checkbox"> 公开外部链接</label>
                <label><input v-model="profileVisibilityContacts" type="checkbox"> 公开联系方式 / 社交平台</label>
                <label><input v-model="profileVisibilityInterests" type="checkbox"> 公开兴趣与推し</label>
                <label><input v-model="profileVisibilityFollows" type="checkbox"> 公开关注对象</label>
              </div>
            </section>
            <label class="search-field profile-bio-field">
              <span>标签</span>
              <div class="chip-editor">
                <div class="profile-tag-row">
                  <button v-for="tag in profileTagRows" :key="tag" type="button" @click="removeProfileTag(tag)">{{ tag }} x</button>
                </div>
                <div class="inline-editor-row">
                  <input v-model="profileTagInput" placeholder="声优活动 / Live / 远征计划" @keydown.enter.prevent="addProfileTag">
                  <button class="secondary-button" type="button" @click="addProfileTag">添加标签</button>
                </div>
              </div>
            </label>
            <label class="search-field profile-bio-field">
              <span>外部链接</span>
              <div class="link-editor">
                <div v-for="(link, index) in profileLinkDraftRows" :key="index" class="link-editor-row">
                  <input v-model="link.label" placeholder="X / GitHub / Blog">
                  <input v-model="link.url" placeholder="https://">
                  <button class="ghost-button" type="button" @click="removeProfileLink(index)">删除</button>
                </div>
                <button class="secondary-button" type="button" @click="addProfileLink">添加链接</button>
              </div>
            </label>
            <label class="search-field profile-bio-field">
              <span>可复制联系方式</span>
              <div class="link-editor">
                <div v-for="(contact, index) in profileContactDraftRows" :key="index" class="link-editor-row contact-editor-row">
                  <input v-model="contact.label" placeholder="QQ / P-ID / Email">
                  <input v-model="contact.value" placeholder="example@example.com">
                  <button class="ghost-button" type="button" @click="removeProfileContact(index)">删除</button>
                </div>
                <button class="secondary-button" type="button" @click="addProfileContact">添加联系方式</button>
              </div>
            </label>
            <label class="search-field profile-bio-field">
              <span>兴趣分类</span>
              <div class="interest-editor">
                <div v-for="(item, index) in profileInterestDraftRows" :key="index" class="interest-editor-row">
                  <input v-model="item.category" placeholder="作品 / 出演者 / 音乐">
                  <input v-model="item.title" placeholder="喜欢的作品、组合或会场">
                  <input v-model="item.imageUrl" placeholder="图片 URL">
                  <textarea v-model="item.note" rows="2" placeholder="为什么喜欢、最近关注什么"></textarea>
                  <button class="ghost-button" type="button" @click="removeProfileInterest(index)">删除</button>
                </div>
                <button class="secondary-button" type="button" @click="addProfileInterest">添加兴趣</button>
              </div>
            </label>
            <div class="profile-editor-submit">
              <button class="primary-button" type="button" @click="saveProfile">保存并返回主页</button>
            </div>
          </form>
        </section>
      </template>
    </section>

    <section v-if="isPublicProfilePage" class="page-view profile-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Public profile</p>
          <h1>公开主页</h1>
        </div>
      </div>

      <section v-if="publicProfileLoading" class="panel">
        <p class="muted">公开主页加载中...</p>
      </section>

      <section v-else-if="publicProfileError" class="panel empty-state">
        <h2>没有找到这个用户</h2>
        <p class="muted">{{ publicProfileError }}</p>
      </section>

      <template v-else-if="publicProfile">
        <section class="profile-link-card public-profile-card">
          <div class="profile-cover">
            <span class="avatar profile-avatar">
              <img v-if="publicProfileData.avatarUrl" :src="publicProfileData.avatarUrl" alt="个人头像">
              <span v-else>{{ publicProfileData.displayName?.slice(0, 1) || publicProfile.user.username.slice(0, 1) }}</span>
            </span>
            <div>
              <p class="eyebrow">Activity identity</p>
              <h2>{{ publicProfileData.displayName || publicProfile.user.displayName }}</h2>
              <p class="profile-handle">@{{ publicProfile.user.username }}</p>
            </div>
          </div>
          <div v-if="publicProfileData.coverUrl" class="profile-cover-image">
            <img :src="publicProfileData.coverUrl" alt="个人主页封面">
          </div>
          <p class="profile-status">{{ publicProfileData.statusLine || "这个用户还没有写一句话状态。" }}</p>
          <p class="profile-bio">{{ publicProfileData.bio || "这个用户还没有填写公开简介。" }}</p>
          <div class="profile-chip-row">
            <span v-if="publicProfileData.homeArea">常驻 {{ publicProfileData.homeArea }}</span>
            <span>{{ typeLabel(publicProfileData.favoriteType || "all") }}</span>
            <span v-if="publicProfileVisibility.stats">{{ publicProfile.stats.favoriteEvents.toLocaleString("ja-JP") }} 个活动</span>
            <span v-if="publicProfileVisibility.stats">{{ publicProfile.stats.follows.toLocaleString("ja-JP") }} 个关注</span>
          </div>
          <div class="profile-tag-row">
            <span v-for="tag in publicProfileTagRows" :key="tag">{{ tag }}</span>
            <span v-if="publicProfileTagRows.length === 0">#Eventnote</span>
          </div>
          <div v-if="publicProfileVisibility.links" class="profile-link-list">
            <a v-for="link in publicProfileLinkRows" :key="link.url" :href="link.url" target="_blank" rel="noreferrer">
              <strong>{{ link.label }}</strong>
              <span>{{ link.url }}</span>
            </a>
          </div>
          <div v-if="publicProfileVisibility.contacts && publicProfileContactRows.length" class="profile-contact-list public-contact-list">
            <div v-for="contact in publicProfileContactRows" :key="contact.label + contact.value">
              <strong>{{ contact.label }}</strong>
              <span>{{ contact.value }}</span>
            </div>
          </div>
        </section>

        <section class="profile-dashboard">
          <section v-if="publicProfileVisibility.stats" class="profile-summary">
            <div class="metric"><span>公开活动数</span><strong>{{ publicProfile.stats.favoriteEvents.toLocaleString("ja-JP") }}</strong></div>
            <div class="metric"><span>关注出演者</span><strong>{{ publicProfile.stats.favoriteArtists.toLocaleString("ja-JP") }}</strong></div>
            <div class="metric"><span>关注作品</span><strong>{{ publicProfile.stats.favoriteWorks.toLocaleString("ja-JP") }}</strong></div>
          </section>

          <section v-if="publicProfileVisibility.follows" class="panel follow-panel">
            <div class="panel-head">
              <h2>公开关注</h2>
              <span class="muted">展示部分出演者、作品和会场</span>
            </div>
            <div class="follow-grid">
              <section>
                <h3>出演者</h3>
                <button v-for="artist in publicProfile.follows.artists" :key="artist.name" type="button" @click="openArtist(artist)">{{ artist.name }}</button>
                <p v-if="publicProfile.follows.artists.length === 0" class="muted">还没有公开关注出演者。</p>
              </section>
              <section>
                <h3>作品</h3>
                <button v-for="work in publicProfile.follows.works" :key="work.title" type="button" @click="openWork(work)">{{ work.title }}</button>
                <p v-if="publicProfile.follows.works.length === 0" class="muted">还没有公开关注作品。</p>
              </section>
              <section>
                <h3>会场</h3>
                <button v-for="venue in publicProfile.follows.venues" :key="venue.id" type="button" @click="openVenue(venue)">{{ displayVenue(venue.name) }}</button>
                <p v-if="publicProfile.follows.venues.length === 0" class="muted">还没有公开关注会场。</p>
              </section>
            </div>
          </section>

          <section v-if="publicProfileVisibility.interests" class="panel profile-preview-section">
            <div class="panel-head">
              <h2>兴趣与推し</h2>
            </div>
            <div v-if="publicProfileInterestGroups.length" class="profile-interest-grid">
              <article v-for="group in publicProfileInterestGroups" :key="group.category" class="profile-interest-card">
                <span>{{ group.category }}</span>
                <strong>{{ group.items[0]?.title }}</strong>
                <p>{{ group.items[0]?.note || "还没有说明。" }}</p>
              </article>
            </div>
            <p v-else class="muted">这个用户还没有公开兴趣内容。</p>
          </section>
        </section>
      </template>
    </section>

    <section v-if="page === 'notebook'" class="page-view notebook-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">My note</p>
          <h1>参加笔记</h1>
        </div>
      </div>
      <section class="panel notebook-panel">
        <label class="note-field">
          <span>本月活动预算</span>
          <input v-model.number="budget" type="number" min="0" step="1000">
        </label>
        <label class="note-field">
          <span>活动备忘</span>
          <textarea v-model="memo" rows="7" placeholder="记录抽选、交通、物贩、座位、现场感想"></textarea>
        </label>
        <button class="secondary-button" type="button" @click="saveMemo">保存笔记</button>
        <p class="save-state" aria-live="polite">{{ saveState }}</p>
      </section>
    </section>

    <section v-if="page === 'admin'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Operations</p>
          <h1>管理员审核</h1>
        </div>
      </div>

      <section v-if="!authUser" class="panel empty-state">
        <h2>需要登录</h2>
        <p>请先登录管理员账号，再处理活动信息确认和用户提交内容。</p>
        <button class="secondary-button" type="button" @click="go('profile')">去登录</button>
      </section>

      <section v-else-if="!authUser.isAdmin" class="panel empty-state">
        <h2>当前账号没有管理员权限</h2>
        <p>管理员入口只显示需要审核的活动纠错和近期问答，普通用户可以继续在活动详情页参与确认。</p>
      </section>

      <section v-else class="admin-dashboard">
        <div class="source-summary">
          <div class="metric"><span>待审核纠错</span><strong>{{ adminPendingCorrections.length }}</strong></div>
          <div class="metric"><span>近期问答</span><strong>{{ adminRecentQuestions.length }}</strong></div>
          <div class="metric"><span>当前管理员</span><strong>{{ authUser.displayName }}</strong></div>
          <div class="metric"><span>状态</span><strong>{{ adminLoading ? "同步中" : "已同步" }}</strong></div>
        </div>

        <p v-if="adminError" class="save-state">{{ adminError }}</p>

        <section class="panel">
          <div class="panel-head">
            <h2>待审核纠错</h2>
            <button class="ghost-button" type="button" @click="loadAdminModeration">刷新</button>
          </div>
          <div v-if="!adminPendingCorrections.length" class="empty-state small">暂时没有待审核纠错。</div>
          <div v-else class="admin-review-list">
            <article v-for="correction in adminPendingCorrections" :key="correction.id" class="admin-review-card">
              <div>
                <span>{{ correction.fieldLabel }}</span>
                <h3>{{ correction.event?.title || correction.sourceEventId }}</h3>
                <p>{{ correction.event?.date || "日期未标注" }} · {{ correction.event?.venue || "会场未详" }}</p>
              </div>
              <p class="admin-review-value">{{ correction.value }}</p>
              <p v-if="correction.note">{{ correction.note }}</p>
              <div class="admin-review-meta">
                <span>{{ correction.author?.displayName || "活动用户" }}</span>
                <span>{{ correction.confirmationCount }} 人确认</span>
                <a v-if="correction.sourceUrl" :href="correction.sourceUrl" target="_blank" rel="noreferrer">来源</a>
              </div>
              <div class="correction-actions">
                <button class="ghost-button" type="button" @click="openAdminEvent(correction.sourceEventId)">打开活动</button>
                <button class="secondary-button" type="button" @click="reviewAdminCorrection(correction, 'confirmed')">确认</button>
                <button class="ghost-button" type="button" @click="reviewAdminCorrection(correction, 'rejected')">驳回</button>
                <button class="ghost-button danger" type="button" @click="hideAdminCorrection(correction)">隐藏</button>
              </div>
            </article>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>近期活动问答</h2>
            <span class="muted">用于发现需要补充说明的活动</span>
          </div>
          <div v-if="!adminRecentQuestions.length" class="empty-state small">暂时没有用户提问。</div>
          <div v-else class="admin-review-list">
            <article v-for="question in adminRecentQuestions" :key="question.id" class="admin-review-card compact">
              <div>
                <span>{{ question.author?.displayName || "活动用户" }} · {{ question.answerCount }} 个回答</span>
                <h3>{{ question.event?.title || question.sourceEventId }}</h3>
                <p>{{ question.body }}</p>
              </div>
              <div class="correction-actions">
                <button class="ghost-button" type="button" @click="openAdminEvent(question.sourceEventId)">打开活动</button>
                <button class="ghost-button danger" type="button" @click="hideAdminQuestion(question)">隐藏</button>
              </div>
            </article>
          </div>
        </section>
      </section>
    </section>

    <section v-if="page === 'sources'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Data layer</p>
          <h1>数据来源</h1>
        </div>
      </div>
      <section class="source-summary">
        <div class="metric"><span>活动记录</span><strong>{{ meta.events?.toLocaleString("ja-JP") || "..." }}</strong></div>
        <div class="metric"><span>原始出演者</span><strong>{{ meta.rawActors?.toLocaleString("ja-JP") || "..." }}</strong></div>
        <div class="metric"><span>会场索引</span><strong>{{ meta.venues?.toLocaleString("ja-JP") || "..." }}</strong></div>
        <div class="metric"><span>数据位置</span><strong>Server</strong></div>
      </section>
      <div class="card-grid">
        <article v-for="source in dataSources" :key="source.id" class="source-card">
          <p class="eyebrow">{{ source.reliability }}</p>
          <h2>{{ source.name }}</h2>
          <p>{{ source.description }}</p>
        </article>
      </div>
      <section class="panel">
        <div class="panel-head">
          <h2>当前活动来源明细</h2>
          <span class="muted">后端分页返回，前端不打包全量数据</span>
        </div>
        <div class="source-list">
          <a v-for="event in events" :key="event.id" :href="event.sourceUrl" target="_blank" rel="noreferrer">
            <strong>{{ event.title }}</strong>
            <span>{{ event.sourceName }} · {{ event.verifiedAt }} · {{ event.status }}</span>
          </a>
        </div>
      </section>
    </section>
  </main>

`;

createApp({
  template,
  setup() {
    const navItems = [
      { id: "home", label: "首页", short: "首页" },
      { id: "events", label: "活动", short: "活动" },
      { id: "artists", label: "出演者", short: "出演" },
      { id: "works", label: "作品", short: "作品" },
      { id: "venues", label: "会场", short: "会场" },
      { id: "sources", label: "来源", short: "来源" },
      { id: "admin", label: "审核", short: "审核", adminOnly: true },
      { id: "favorites", label: "我的", short: "我的" }
    ];

    const page = ref(routePageFromHash());
    const routeParam = ref(routeParamFromHash());
    const globalQuery = ref("");
    const globalSuggestions = ref([]);
    const globalSuggestionGroups = ref([]);
    const showGlobalSuggestions = ref(false);
    const showMobileFilters = ref(false);
    const query = ref("");
    const city = ref("all");
    const cityOptions = ref(defaultCityOptions);
    const eventType = ref("all");
    const directoryQuery = ref("");
    const budget = ref(42000);
    const memo = ref("");
    const saveState = ref("");
    const authUser = ref(null);
    const authMode = ref("login");
    const authUsername = ref("");
    const authDisplayName = ref("");
    const authPassword = ref("");
    const authError = ref("");
    const authLoading = ref(false);
    const profileDisplayName = ref("");
    const profileHomeArea = ref("");
    const profileFavoriteType = ref("all");
    const profileAvatarUrl = ref("");
    const profileCoverUrl = ref("");
    const profileStatusLine = ref("");
    const profileBio = ref("");
    const profileLinks = ref("");
    const profileLinkDraftRows = ref([]);
    const profileTags = ref("");
    const profileTagInput = ref("");
    const profileContacts = ref("");
    const profileContactDraftRows = ref([]);
    const profileInterests = ref("");
    const profileInterestDraftRows = ref([]);
    const profileVisibilityEnabled = ref(true);
    const profileVisibilityLinks = ref(true);
    const profileVisibilityContacts = ref(false);
    const profileVisibilityInterests = ref(true);
    const profileVisibilityFollows = ref(true);
    const profileVisibilityStats = ref(true);
    const activeProfileInterest = ref("");
    const publicProfile = ref(null);
    const publicProfileError = ref("");
    const publicProfileLoading = ref(false);
    const profileCopyState = ref("");
    const profileSaveState = ref("");
    const mySection = ref("overview");
    const eventNoteStatus = ref("none");
    const eventNoteMemo = ref("");
    const eventNoteSaveState = ref("");
    const showAllEventArtists = ref(false);
    const showCorrectionPanel = ref(false);
    const calendarFeedUrl = ref("");
    const calendarWebcalUrl = ref("");
    const eventExtra = ref({});
    const ticketReference = ref({});
    const ticketReferenceLoading = ref(false);
    const ticketReferencePage = ref(1);
    const eventInteractions = ref({ statusStats: { items: [], total: 0 }, questions: [], corrections: [], currentUser: null });
    const questionDraft = ref("");
    const correctionField = ref("venue");
    const correctionValue = ref("");
    const correctionSourceUrl = ref("");
    const correctionNote = ref("");
    const interactionSaveState = ref("");
    const adminModeration = ref({ pendingCorrections: [], recentQuestions: [], currentUser: null });
    const adminLoading = ref(false);
    const adminError = ref("");
    const collapsedArtistLimit = 12;
    const events = ref([]);
    const dayEvents = ref([]);
    const eventListFilter = ref("all");
    const relatedUpcomingEvents = ref([]);
    const relatedEndedEvents = ref([]);
    const relatedUpcomingTotal = ref(0);
    const relatedEndedTotal = ref(0);
    const relatedUpcomingPage = ref(1);
    const relatedEndedPage = ref(1);
    const relatedEventType = ref("all");
    const loadingRelated = ref(false);
    const relatedEventLimit = 100;
    const collapsedRelatedSections = ref(new Set(["ended"]));
    const querySuggestions = ref([]);
    const querySuggestionGroups = ref([]);
    const directorySuggestions = ref([]);
    const showQuerySuggestions = ref(false);
    const showDirectorySuggestions = ref(false);
    const selectedEvent = ref(null);
    const eventReturnPage = ref("events");
    const artistRows = ref([]);
    const works = ref([]);
    const venues = ref([]);
    const selectedArtist = ref(null);
    const selectedWork = ref(null);
    const selectedVenue = ref(null);
    const meta = ref({});
    const loading = ref(false);
    const loadError = ref("");
    const dayEventTotal = ref(0);
    const calendarTotal = ref(0);
    const calendarDays = ref([]);
    const calendarYears = ref([]);
    const initialDate = toDateKey(new Date());
    const currentMonth = ref(initialDate.slice(0, 7));
    const selectedDate = ref(initialDate);
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const followedCount = computed(() => artistRows.value.length);
    const favoriteIds = ref(new Set());
    const favoriteItems = ref([]);
    const favoriteEntityIds = ref({
      artists: new Set(),
      works: new Set(),
      venues: new Set()
    });
    const favoriteStatusFilter = ref("all");
    const favoritePeriodFilter = ref("all");
    const favoriteAreaFilter = ref("all");
    const favoriteArtists = ref([]);
    const favoriteWorks = ref([]);
    const favoriteVenues = ref([]);
    const favoriteMonth = ref(initialDate.slice(0, 7));
    const favoriteSelectedDate = ref(initialDate);

    const dataSources = computed(() => [
      {
        id: "eventernote-zenodo",
        name: "Eventernote 历史数据集",
        reliability: "真实历史数据",
        description: `后端已载入 ${Number(meta.value.events || 0).toLocaleString("ja-JP")} 条历史活动，来源 DOI ${meta.value.doi || "10.5281/zenodo.11151063"}。`
      },
      {
        id: "server-api",
        name: "本地分页 API",
        reliability: "当前架构",
        description: "全量数据保存在 data/generated/eventernote-catalog.json，浏览器只请求 /api/events 当前页。"
      },
      {
        id: "venues",
        name: "会场名缓存",
        reliability: "部分补全",
        description: "Eventernote 原始数据只有 place_id；已缓存访问过的会场名，其余可继续批量补齐。"
      }
    ]);
    const latestSyncDate = computed(() => {
      const value = meta.value.latestSync?.syncedAt || meta.value.generatedAt || "";
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    });
    const dataFreshnessLabel = computed(() => {
      if (!latestSyncDate.value) return "未读取同步时间";
      return latestSyncDate.value.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
    });
    const dataFreshnessSummary = computed(() => {
      const sync = meta.value.latestSync;
      if (!sync) return "当前只读取到本地生成数据，未检测到 latest crawl 元信息。";
      const range = [sync.startDate, sync.endDate].filter(Boolean).join(" 至 ");
      return `${range || "覆盖日期未标注"}，最新抓取 ${Number(sync.events || 0).toLocaleString("ja-JP")} 条。`;
    });

    const normalizedDirectoryQuery = computed(() => directoryQuery.value.trim().toLowerCase());
    const visibleArtists = computed(() => {
      return artistRows.value.slice(0, 48);
    });
    const visibleWorks = computed(() => {
      return works.value.filter((work) => isConcreteWorkTitle(work.title));
    });
    const visibleVenues = computed(() => {
      return venues.value.filter((venue) => isConcreteVenueName(venue.name)).slice(0, 60);
    });
    const directorySuggestionScope = computed(() => {
      if (page.value === "artists") return "artists";
      if (page.value === "works") return "works";
      if (page.value === "venues") return "venues";
      return "";
    });

    const plannedCount = computed(() => favoriteIds.value.size);
    const followedEntityCount = computed(() => favoriteArtists.value.length + favoriteWorks.value.length + favoriteVenues.value.length);
    const isAccountPage = computed(() => false);
    const upcomingFavoriteItems = computed(() => {
      return favoriteItems.value
        .filter((event) => event.date && event.date >= initialDate)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5);
    });
    const homeEvents = computed(() => {
      return authUser.value && upcomingFavoriteItems.value.length
        ? upcomingFavoriteItems.value
        : dayEvents.value.slice(0, 5);
    });
    const nextPlanLabel = computed(() => {
      const next = upcomingFavoriteItems.value[0];
      if (!next) return favoriteItems.value.length ? "整理已收藏活动" : "收藏第一场活动";
      return `${next.date.slice(5).replace("-", "/")} ${next.title}`;
    });
    const eventNoteStatusLabel = computed(() => {
      return eventNoteStatusOptions.find(([value]) => value === eventNoteStatus.value)?.[1] || "未记录";
    });
    const eventStatusStats = computed(() => eventInteractions.value.statusStats?.items || []);
    const eventQuestions = computed(() => eventInteractions.value.questions || []);
    const eventCorrections = computed(() => eventInteractions.value.corrections || []);
    const hasGlobalSuggestions = computed(() => globalSuggestionGroups.value.some((group) => group.items?.length) || globalSuggestions.value.length > 0);
    const hasQuerySuggestions = computed(() => querySuggestionGroups.value.some((group) => group.items?.length) || querySuggestions.value.length > 0);
    const canReviewCorrections = computed(() => Boolean(eventInteractions.value.currentUser?.isAdmin));
    const visibleNavItems = computed(() => navItems.filter((item) => !item.adminOnly || authUser.value?.isAdmin));
    const mobileNavItems = computed(() => [
      { id: "events", short: "日历" },
      { id: "favorites", short: "我的活动" },
      { id: "profile", short: "添加活动", add: true },
      { id: "home", short: "发现" },
      { id: "sources", short: "更多" }
    ].filter((item) => item.id !== "sources" || visibleNavItems.value.some((nav) => nav.id === "sources")));
    const adminPendingCorrections = computed(() => adminModeration.value.pendingCorrections || []);
    const adminRecentQuestions = computed(() => adminModeration.value.recentQuestions || []);
    const isUpcomingSelectedEvent = computed(() => Boolean(selectedEvent.value?.date && selectedEvent.value.date >= initialDate));
    const ticketReferenceCheckedLabel = computed(() => {
      if (!ticketReference.value?.checkedAt) return "未检查";
      const date = new Date(ticketReference.value.checkedAt);
      if (Number.isNaN(date.getTime())) return "已检查";
      return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    });
    const ticketReferenceStatusLabel = computed(() => ({
      found: "已匹配公开出品",
      not_found: "未匹配同日出品",
      past_event: "已结束不检查",
      timeout: "读取超时",
      error: "读取失败",
      disabled: "服务端已关闭"
    }[ticketReference.value?.status] || "未检查"));
    const ticketReferenceCacheLabel = computed(() => {
      if (ticketReferenceLoading.value) return "读取中";
      if (ticketReference.value?.cached) return "缓存结果";
      if (ticketReference.value?.checkedAt) return "刚刚检查";
      return "未检查";
    });
    const ticketReferenceTrustNote = computed(() => {
      if (ticketReference.value?.status === "disabled") return "当前服务器关闭了外部票务查询，只保留跳转原站搜索入口。";
      if (ticketReference.value?.status === "timeout") return "外部页面响应较慢，系统会短时间缓存失败状态，避免反复阻塞详情页。";
      if (ticketReference.value?.status === "error") return "外部页面读取失败时只作为不可用状态展示，不影响活动本身信息。";
      return "票价来自 TicketJam 公开页面的同日期文本匹配，可能存在标题相似或票券条件差异，请以原站详情和官方信息为准。";
    });
    const ticketReferenceListings = computed(() => Array.isArray(ticketReference.value?.listings) ? ticketReference.value.listings : []);
    const ticketReferencePageSize = 5;
    const ticketReferencePageCount = computed(() => Math.max(1, Math.ceil(ticketReferenceListings.value.length / ticketReferencePageSize)));
    const pagedTicketReferenceListings = computed(() => {
      const pageNumber = Math.min(ticketReferencePage.value, ticketReferencePageCount.value);
      const start = (pageNumber - 1) * ticketReferencePageSize;
      return ticketReferenceListings.value.slice(start, start + ticketReferencePageSize);
    });
    const correctionFieldOptions = [
      ["title", "标题"],
      ["date", "日期"],
      ["venue", "会场"],
      ["artists", "出演者"],
      ["time", "时间"],
      ["ticket", "票务"],
      ["source", "来源链接"],
      ["type", "类型"],
      ["other", "其他"]
    ];
    const correctionStatusLabel = (status) => ({
      pending: "待确认",
      confirmed: "已确认",
      rejected: "已驳回"
    }[status] || "待确认");
    const eventCardTags = (event) => {
      const city = String(event?.city || "").trim();
      const region = city && city !== "unknown" && city !== "未标注" ? city : "";
      return [
        region ? { label: region, className: "region-tag" } : null,
        { label: typeLabel(event?.type || "event"), className: "type-tag" }
      ].filter(Boolean);
    };
    const eventCardArtistSummary = (event) => {
      const artists = displayArtists(event);
      if (!artists.length) return "";
      const head = artists.slice(0, 2).join(" / ");
      return artists.length > 2 ? `${head} +${artists.length - 2}` : head;
    };
    const desktopDateStrip = computed(() => {
      const monthDays = calendarCells.value.filter((day) => day.inMonth);
      const activeIndex = Math.max(0, monthDays.findIndex((day) => day.date === selectedDate.value));
      const start = Math.max(0, Math.min(activeIndex - 6, Math.max(0, monthDays.length - 14)));
      return monthDays.slice(start, start + 14).map((day) => ({
        ...day,
        weekday: weekdays[new Date(`${day.date}T00:00:00`).getDay()]
      }));
    });
    const filteredDayEvents = computed(() => {
      if (eventListFilter.value === "joined") {
        return dayEvents.value.filter((event) => isJoined(event));
      }
      if (eventListFilter.value === "planning") {
        return dayEvents.value.filter((event) => ["want", "ticketing", "won", "paid"].includes(normalizeEventNoteStatus(event?.note?.status || event?.myStatus || "")));
      }
      if (eventListFilter.value === "ticketing") {
        return dayEvents.value.filter((event) => normalizeEventNoteStatus(event?.note?.status || event?.myStatus || "") === "ticketing");
      }
      if (eventListFilter.value === "waiting") {
        return dayEvents.value.filter((event) => !isJoined(event));
      }
      return dayEvents.value;
    });
    const eventListFilterOptions = computed(() => {
      const planning = dayEvents.value.filter((event) => ["want", "ticketing", "won", "paid"].includes(normalizeEventNoteStatus(event?.note?.status || event?.myStatus || ""))).length;
      const ticketing = dayEvents.value.filter((event) => normalizeEventNoteStatus(event?.note?.status || event?.myStatus || "") === "ticketing").length;
      const joined = dayEvents.value.filter((event) => isJoined(event)).length;
      return [
        { id: "all", label: "全部", count: dayEventTotal.value },
        { id: "joined", label: "已参加", count: joined },
        { id: "planning", label: "计划中", count: planning },
        { id: "ticketing", label: "抽选中", count: ticketing },
        { id: "waiting", label: "待定", count: Math.max(0, dayEvents.value.length - joined) }
      ];
    });
    const eventListStatusLabel = (event) => {
      if (isJoined(event)) return "已参加";
      const status = normalizeEventNoteStatus(event?.note?.status || event?.myStatus || "");
      return eventNoteStatusOptions.find(([value]) => value === status)?.[1] || "计划中";
    };
    const compactMonthDay = (date) => {
      const [, , month = "", day = ""] = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
      return month && day ? `${month}.${day}` : date;
    };
    const profileTagRows = computed(() => {
      return profileTags.value
        .split(/[\n,，、]/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 12)
        .map((tag) => `#${tag}`);
    });
    const profileLinkRows = computed(() => {
      return profileLinks.value
        .split("\n")
        .map(parseProfileLink)
        .filter(Boolean)
        .slice(0, 8);
    });
    const profileContactRows = computed(() => {
      return profileContacts.value
        .split("\n")
        .map(parseLabelValueRow)
        .filter(Boolean)
        .slice(0, 8);
    });
    const profileInterestRows = computed(() => {
      return profileInterests.value
        .split("\n")
        .map(parseInterestRow)
        .filter(Boolean)
        .slice(0, 24);
    });
    const profileInterestGroups = computed(() => {
      const groups = new Map();
      for (const row of profileInterestRows.value) {
        if (!groups.has(row.category)) groups.set(row.category, []);
        groups.get(row.category).push(row);
      }
      return [...groups.entries()].map(([category, items]) => ({ category, items }));
    });
    const activeProfileInterestItems = computed(() => {
      const active = activeProfileInterest.value || profileInterestGroups.value[0]?.category || "";
      return profileInterestGroups.value.find((group) => group.category === active)?.items || [];
    });
    const publicProfileData = computed(() => publicProfile.value?.profile || {});
    const publicProfileLinkRows = computed(() => {
      return String(publicProfileData.value.links || "")
        .split("\n")
        .map(parseProfileLink)
        .filter(Boolean)
        .slice(0, 8);
    });
    const publicProfileContactRows = computed(() => {
      return String(publicProfileData.value.contacts || "")
        .split("\n")
        .map(parseLabelValueRow)
        .filter(Boolean)
        .slice(0, 8);
    });
    const publicProfileTagRows = computed(() => {
      return String(publicProfileData.value.tags || "")
        .split(/[\n,，、]/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 12)
        .map((tag) => `#${tag}`);
    });
    const publicProfileInterestGroups = computed(() => {
      const groups = new Map();
      for (const row of String(publicProfileData.value.interests || "").split("\n").map(parseInterestRow).filter(Boolean)) {
        if (!groups.has(row.category)) groups.set(row.category, []);
        groups.get(row.category).push(row);
      }
      return [...groups.entries()].map(([category, items]) => ({ category, items }));
    });
    const publicProfileUrl = computed(() => {
      return authUser.value?.username ? `#/users/${encodeURIComponent(authUser.value.username)}` : "";
    });
    const publicProfileVisibility = computed(() => publicProfile.value?.visibility || {});
    const isPublicProfilePage = computed(() => page.value === "users" || window.location.hash.startsWith("#/users/"));
    const isProfileEditPage = computed(() => page.value === "profile" && routeParam.value === "edit");
    const actionInfoSummary = computed(() => {
      if (eventExtra.value.price) return `票价：${eventExtra.value.price}`;
      if (eventExtra.value.ticketUrl && eventExtra.value.officialUrl) return "官网和票务链接已补充，可直接从顶部操作区打开。";
      if (eventExtra.value.ticketUrl) return "票务链接已补充，可直接从顶部操作区打开。";
      if (eventExtra.value.officialUrl) return "官网链接已补充，可直接从顶部操作区打开。";
      if (eventExtra.value.ticketInfo) return "已有票务说明，详情见活动补充。";
      return "官网、票务、票价会优先展示在这里。";
    });
    const eventSourceSummary = computed(() => {
      const event = selectedEvent.value;
      if (!event) return "当前没有活动来源。";
      const verified = event.verifiedAt ? `确认于 ${event.verifiedAt}` : "未标注确认日期";
      return `${verified}，原始页面可从底部打开核对。`;
    });
    const favoriteEventsByDate = computed(() => {
      const groups = new Map();
      for (const event of favoriteItems.value) {
        const date = event.date || "未定";
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(event);
      }
      return groups;
    });
    const favoriteUpcomingItems = computed(() => {
      return favoriteItems.value
        .filter((event) => event.date && event.date >= initialDate)
        .slice()
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    });
    const favoriteEndedItems = computed(() => {
      return favoriteItems.value
        .filter((event) => !event.date || event.date < initialDate)
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    });
    const normalizeEventNoteStatus = (status) => {
      if (status === "going") return "want";
      if (status === "skip") return "none";
      return eventNoteStatusOptions.some(([value]) => value === status) ? status : "none";
    };
    const eventStatusForFavorite = (event) => {
      return normalizeEventNoteStatus(event?.note?.status || event?.myStatus || "none");
    };
    const favoriteAreaOptions = computed(() => {
      return [...new Set(favoriteItems.value.map((event) => event.city || "未标注"))].sort((a, b) => a.localeCompare(b, "ja"));
    });
    const favoriteFilteredItems = computed(() => {
      return favoriteItems.value.filter((event) => {
        if (favoriteStatusFilter.value !== "all" && eventStatusForFavorite(event) !== favoriteStatusFilter.value) return false;
        if (favoritePeriodFilter.value === "upcoming" && (!event.date || event.date < initialDate)) return false;
        if (favoritePeriodFilter.value === "ended" && event.date && event.date >= initialDate) return false;
        if (favoriteAreaFilter.value !== "all" && (event.city || "未标注") !== favoriteAreaFilter.value) return false;
        return true;
      });
    });
    const favoriteFilteredEventsByDate = computed(() => {
      const groups = new Map();
      for (const event of favoriteFilteredItems.value) {
        const date = event.date || "未定";
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(event);
      }
      return groups;
    });
    const sortFavoriteStatusItems = (items) => items.slice().sort((a, b) => {
      const aUpcoming = a.date && a.date >= initialDate;
      const bUpcoming = b.date && b.date >= initialDate;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      if (aUpcoming && bUpcoming) return String(a.date || "").localeCompare(String(b.date || ""));
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    const favoriteStatusGroups = computed(() => {
      return eventNoteStatusOptions
        .map(([status, label]) => ({
          status,
          label,
          items: sortFavoriteStatusItems(favoriteFilteredItems.value.filter((event) => eventStatusForFavorite(event) === status))
        }))
        .filter((group) => group.items.length);
    });
    const favoritePlanningCount = computed(() => favoriteFilteredItems.value.filter((event) => ["want", "ticketing", "won", "paid"].includes(eventStatusForFavorite(event))).length);
    const favoriteDoneCount = computed(() => favoriteFilteredItems.value.filter((event) => ["done", "gaveup"].includes(eventStatusForFavorite(event))).length);
    const favoriteCalendarTitle = computed(() => {
      const [year, month] = favoriteMonth.value.split("-");
      return `${year}年${Number(month)}月`;
    });
    const favoriteMonthOptions = computed(() => {
      return [...new Set(favoriteItems.value.map((event) => event.date?.slice(0, 7)).filter(Boolean))]
        .sort((a, b) => b.localeCompare(a));
    });
    const favoriteCalendarCells = computed(() => {
      const [year, month] = favoriteMonth.value.split("-").map(Number);
      const first = new Date(year, month - 1, 1);
      const start = new Date(first);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const iso = toDateKey(date);
        const items = favoriteFilteredEventsByDate.value.get(iso) || [];
        return {
          key: iso,
          date: iso,
          day: date.getDate(),
          inMonth: date.getMonth() === month - 1,
          count: items.length,
          samples: items.slice(0, 1)
        };
      });
    });
    const favoriteMonthTotal = computed(() => favoriteFilteredItems.value.filter((event) => event.date?.startsWith(favoriteMonth.value)).length);
    const selectedFavoriteItems = computed(() => favoriteFilteredEventsByDate.value.get(favoriteSelectedDate.value) || []);
    const favoriteSelectedDateLabel = computed(() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(favoriteSelectedDate.value)) return "选择日期";
      return formatDetailDate(favoriteSelectedDate.value);
    });
    const visibleEventArtists = computed(() => {
      const artists = selectedEvent.value?.artists || [];
      return showAllEventArtists.value ? artists : artists.slice(0, collapsedArtistLimit);
    });
    const relatedEvents = computed(() => [...relatedUpcomingEvents.value, ...relatedEndedEvents.value]);
    const relatedEventTotal = computed(() => relatedUpcomingTotal.value + relatedEndedTotal.value);
    const relatedEventSections = computed(() => [
      {
        id: "upcoming",
        label: "未开活动",
        items: relatedUpcomingEvents.value,
        total: relatedUpcomingTotal.value,
        collapsed: collapsedRelatedSections.value.has("upcoming"),
        hasMore: relatedUpcomingEvents.value.length < relatedUpcomingTotal.value
      },
      {
        id: "ended",
        label: "已开活动",
        items: relatedEndedEvents.value,
        total: relatedEndedTotal.value,
        collapsed: collapsedRelatedSections.value.has("ended"),
        hasMore: relatedEndedEvents.value.length < relatedEndedTotal.value
      }
    ]);
    const eventNoteStatusOptions = [
      ["none", "未记录"],
      ["want", "想去"],
      ["ticketing", "抽选/购票中"],
      ["won", "已中票"],
      ["paid", "已购票"],
      ["done", "已参加"],
      ["gaveup", "放弃"]
    ];
    const artistHistoricalTotal = computed(() => Math.max(selectedArtist.value?.follows || 0, relatedEventTotal.value || 0));
    const venueHistoricalTotal = computed(() => Math.max(selectedVenue.value?.events || 0, relatedEventTotal.value || 0));
    const eventBackLabel = computed(() => {
      if (eventReturnPage.value === "artist") return "返回出演者";
      if (eventReturnPage.value === "work") return "返回作品";
      if (eventReturnPage.value === "venue") return "返回会场";
      return "回到当天";
    });
    const calendarTitle = computed(() => {
      const [year, month] = currentMonth.value.split("-");
      return `${year}年${Number(month)}月`;
    });
    const currentYear = computed(() => currentMonth.value.slice(0, 4));
    const yearOptions = computed(() => {
      const years = calendarYears.value.map((row) => row.year);
      return years.includes(currentYear.value) ? years : [currentYear.value, ...years];
    });
    const selectedDateLabel = computed(() => {
      const date = new Date(`${selectedDate.value}T00:00:00`);
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
      });
    });
    const calendarCells = computed(() => {
      const dayMap = new Map(calendarDays.value.map((day) => [day.date, day]));
      const [year, month] = currentMonth.value.split("-").map(Number);
      const first = new Date(year, month - 1, 1);
      const start = new Date(first);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const iso = toDateKey(date);
        const stats = dayMap.get(iso);
        return {
          key: iso,
          date: iso,
          day: date.getDate(),
          inMonth: date.getMonth() === month - 1,
          count: stats?.count || 0,
          samples: stats?.samples || []
        };
      });
    });

    async function loadMeta() {
      meta.value = await getJson("/api/meta");
      cityOptions.value = [
        ["all", "全部地区"],
        ...(meta.value.locationOptions || []).map((item) => [item.value, `${item.label} (${Number(item.count || 0).toLocaleString("ja-JP")})`])
      ];
    }

    async function loadEvents() {
      loading.value = true;
      const params = new URLSearchParams({
        q: query.value,
        city: city.value,
        type: eventType.value,
        limit: "48"
      });
      const payload = await getJson(`/api/events?${params}`);
      events.value = payload.items;
      loading.value = false;
    }

    async function loadCalendar() {
      loading.value = true;
      loadError.value = "";
      try {
        const params = new URLSearchParams({
          month: currentMonth.value,
          date: selectedDate.value,
          q: query.value,
          city: city.value,
          type: eventType.value
        });
        const payload = await getJson(`/api/calendar?${params}`);
        calendarDays.value = payload.days;
        calendarTotal.value = payload.total;
        const firstMatchingDate = calendarDays.value[0]?.date || "";
        if (!isDateInCurrentMonth(selectedDate.value)) {
          selectedDate.value = firstMatchingDate || `${currentMonth.value}-01`;
        } else if (payload.selectedTotal === 0 && firstMatchingDate && selectedDate.value !== firstMatchingDate) {
          selectedDate.value = firstMatchingDate;
        }
        if (page.value === "events" && window.location.hash !== `#/events/${selectedDate.value}`) {
          window.history.replaceState(null, "", `#/events/${selectedDate.value}`);
          currentRouteKey = `events/${selectedDate.value}`;
          routeParam.value = selectedDate.value;
        }
        if (payload.selectedDate === selectedDate.value) {
          dayEvents.value = payload.selectedItems || [];
          dayEventTotal.value = payload.selectedTotal || 0;
          syncWorkbenchSelection();
        } else {
          await loadDayEvents();
        }
      } catch (error) {
        loadError.value = `日历数据加载失败：${error?.message || String(error)}`;
        console.error(error);
      } finally {
        loading.value = false;
      }
    }

    async function loadYearOverview() {
      const params = new URLSearchParams({
        q: query.value,
        city: city.value,
        type: eventType.value
      });
      const payload = await getJson(`/api/calendar-years?${params}`);
      calendarYears.value = payload.years;
    }

    async function loadDayEvents() {
      const params = new URLSearchParams({
        date: selectedDate.value,
        q: query.value,
        city: city.value,
        type: eventType.value,
        _: String(Date.now())
      });
      const payload = await getJson(`/api/day-events?${params}`);
      dayEvents.value = payload.items;
      dayEventTotal.value = payload.total;
      syncWorkbenchSelection();
    }

    function syncWorkbenchSelection() {
      if (page.value !== "events") return;
      const stillVisible = selectedEvent.value?.sourceEventId && dayEvents.value.some((event) => event.sourceEventId === selectedEvent.value.sourceEventId);
      if (!stillVisible) {
        selectedEvent.value = dayEvents.value[0] || null;
      }
      if (selectedEvent.value?.sourceEventId) {
        loadEventNote().catch(console.error);
        loadEventExtra().catch(console.error);
        loadEventTicketReference().catch(console.error);
        loadEventInteractions().catch(console.error);
      }
    }

    async function loadEventBySourceId(sourceEventId) {
      if (!sourceEventId) return;
      const payload = await getJson(`/api/event?sourceEventId=${encodeURIComponent(sourceEventId)}`);
      selectedEvent.value = payload.item;
      showAllEventArtists.value = false;
      loadEventNote().catch(console.error);
      loadEventExtra().catch(console.error);
      loadEventTicketReference().catch(console.error);
      loadEventInteractions().catch(console.error);
    }

    async function loadEventExtra() {
      if (!selectedEvent.value?.sourceEventId) {
        applyEventExtra({});
        return;
      }
      const payload = await getJson(`/api/event-extra?sourceEventId=${encodeURIComponent(selectedEvent.value.sourceEventId)}`);
      applyEventExtra(payload.extra || {});
    }

    function applyEventExtra(extra) {
      eventExtra.value = extra || {};
    }

    async function loadEventTicketReference(force = false) {
      if (!selectedEvent.value?.sourceEventId || !isUpcomingSelectedEvent.value) {
        ticketReference.value = {};
        ticketReferencePage.value = 1;
        return;
      }
      ticketReferenceLoading.value = true;
      try {
        const params = new URLSearchParams({
          sourceEventId: selectedEvent.value.sourceEventId,
          ...(force ? { force: "1" } : {})
        });
        const payload = await getJson(`/api/event-ticket-reference?${params}`);
        ticketReference.value = payload.reference || {};
        ticketReferencePage.value = 1;
      } catch (error) {
        ticketReference.value = {
          platform: "TicketJam",
          status: "error",
          searchUrl: `https://ticketjam.jp/tickets_search?query=${encodeURIComponent(selectedEvent.value.title || "")}`,
          minPrice: null,
          listingCount: 0,
          checkedAt: new Date().toISOString(),
          message: error?.message || "票价参考暂时读取失败。"
        };
        ticketReferencePage.value = 1;
      } finally {
        ticketReferenceLoading.value = false;
      }
    }

    async function loadEventNote() {
      if (!authUser.value || !selectedEvent.value?.sourceEventId) {
        eventNoteStatus.value = "none";
        eventNoteMemo.value = "";
        return;
      }
      const payload = await getJson(`/api/event-note?sourceEventId=${encodeURIComponent(selectedEvent.value.sourceEventId)}`);
      eventNoteStatus.value = normalizeEventNoteStatus(payload.note?.status);
      eventNoteMemo.value = payload.note?.memo || "";
    }

    async function saveEventNote() {
      if (!authUser.value || !selectedEvent.value?.sourceEventId) return;
      const payload = await postJson("/api/event-note", {
        sourceEventId: selectedEvent.value.sourceEventId,
        status: eventNoteStatus.value,
        memo: eventNoteMemo.value
      });
      eventNoteStatus.value = payload.note?.status || eventNoteStatus.value;
      eventNoteMemo.value = payload.note?.memo || "";
      eventNoteSaveState.value = "已保存";
      loadEventInteractions().catch(console.error);
      window.setTimeout(() => {
        if (eventNoteSaveState.value === "已保存") eventNoteSaveState.value = "";
      }, 2200);
    }

    async function loadEventInteractions() {
      if (!selectedEvent.value?.sourceEventId) return;
      const payload = await getJson(`/api/event-interactions?sourceEventId=${encodeURIComponent(selectedEvent.value.sourceEventId)}`);
      eventInteractions.value = payload;
    }

    async function submitQuestion() {
      if (!authUser.value) return go("profile");
      const body = questionDraft.value.trim();
      if (!body || !selectedEvent.value?.sourceEventId) return;
      interactionSaveState.value = "提交中...";
      try {
        eventInteractions.value = await postJson("/api/event-question", {
          sourceEventId: selectedEvent.value.sourceEventId,
          body
        });
        questionDraft.value = "";
        interactionSaveState.value = "问题已提交";
      } catch (error) {
        interactionSaveState.value = error?.message || "提交失败";
      }
    }

    async function submitAnswer(question) {
      if (!authUser.value) return go("profile");
      const body = String(question.answerDraft || "").trim();
      if (!body) return;
      interactionSaveState.value = "提交中...";
      try {
        eventInteractions.value = await postJson("/api/event-answer", {
          questionId: question.id,
          body
        });
        interactionSaveState.value = "回答已提交";
      } catch (error) {
        interactionSaveState.value = error?.message || "提交失败";
      }
    }

    async function submitCorrection() {
      if (!authUser.value) return go("profile");
      const value = correctionValue.value.trim();
      if (!value || !selectedEvent.value?.sourceEventId) return;
      interactionSaveState.value = "提交中...";
      try {
        eventInteractions.value = await postJson("/api/event-correction", {
          sourceEventId: selectedEvent.value.sourceEventId,
          field: correctionField.value,
          value,
          note: correctionNote.value,
          sourceUrl: correctionSourceUrl.value
        });
        correctionValue.value = "";
        correctionNote.value = "";
        correctionSourceUrl.value = "";
        interactionSaveState.value = "纠错已提交";
      } catch (error) {
        interactionSaveState.value = error?.message || "提交失败";
      }
    }

    async function confirmCorrection(correction) {
      if (!authUser.value) return go("profile");
      eventInteractions.value = await postJson("/api/event-correction-confirm", { id: correction.id });
    }

    async function reviewCorrection(correction, status) {
      if (!canReviewCorrections.value) return;
      eventInteractions.value = await postJson("/api/event-correction-review", { id: correction.id, status });
    }

    async function deleteQuestion(question) {
      if (!question?.canDelete) return;
      eventInteractions.value = await postJson("/api/event-question-delete", { id: question.id });
    }

    async function deleteAnswer(answer) {
      if (!answer?.canDelete) return;
      eventInteractions.value = await postJson("/api/event-answer-delete", { id: answer.id });
    }

    async function hideCorrection(correction) {
      if (!correction?.canHide) return;
      eventInteractions.value = await postJson("/api/event-correction-hide", { id: correction.id });
    }

    async function loadAdminModeration() {
      if (!authUser.value?.isAdmin) return;
      adminLoading.value = true;
      adminError.value = "";
      try {
        adminModeration.value = await getJson("/api/admin/moderation");
      } catch (error) {
        adminError.value = error?.message || "审核数据读取失败";
      } finally {
        adminLoading.value = false;
      }
    }

    async function reviewAdminCorrection(correction, status) {
      if (!authUser.value?.isAdmin) return;
      adminLoading.value = true;
      adminError.value = "";
      try {
        adminModeration.value = await postJson("/api/admin/correction-review", { id: correction.id, status });
      } catch (error) {
        adminError.value = error?.message || "审核操作失败";
      } finally {
        adminLoading.value = false;
      }
    }

    async function hideAdminQuestion(question) {
      if (!authUser.value?.isAdmin) return;
      adminLoading.value = true;
      adminError.value = "";
      try {
        adminModeration.value = await postJson("/api/admin/question-hide", { id: question.id });
      } catch (error) {
        adminError.value = error?.message || "隐藏失败";
      } finally {
        adminLoading.value = false;
      }
    }

    async function hideAdminCorrection(correction) {
      if (!authUser.value?.isAdmin) return;
      adminLoading.value = true;
      adminError.value = "";
      try {
        adminModeration.value = await postJson("/api/admin/correction-hide", { id: correction.id });
      } catch (error) {
        adminError.value = error?.message || "隐藏失败";
      } finally {
        adminLoading.value = false;
      }
    }

    function openAdminEvent(sourceEventId) {
      if (!sourceEventId) return;
      window.location.hash = `#/event/${encodeURIComponent(sourceEventId)}`;
    }

    function currentRelatedQuery() {
      if (page.value === "artist") return selectedArtist.value?.name || "";
      if (page.value === "work") return selectedWork.value?.title || "";
      if (page.value === "venue") return selectedVenue.value?.name || "";
      return "";
    }

    async function loadRelatedEvents(value) {
      if (!value) {
        relatedUpcomingEvents.value = [];
        relatedEndedEvents.value = [];
        relatedUpcomingTotal.value = 0;
        relatedEndedTotal.value = 0;
        relatedUpcomingPage.value = 1;
        relatedEndedPage.value = 1;
        return;
      }
      loadingRelated.value = true;
      try {
        await Promise.all([
          loadRelatedEventBucket("upcoming", 1, false),
          loadRelatedEventBucket("ended", 1, false)
        ]);
      } finally {
        loadingRelated.value = false;
      }
    }

    async function loadRelatedEventBucket(bucket, pageNumber, append) {
      const value = currentRelatedQuery();
      if (!value) return;
      const isUpcoming = bucket === "upcoming";
      const params = new URLSearchParams({
        q: value,
        city: "all",
        type: relatedEventType.value,
        sort: "date-desc",
        page: String(pageNumber),
        limit: String(relatedEventLimit)
      });
      params.set(isUpcoming ? "dateFrom" : "dateBefore", initialDate);
      const payload = await getJson(`/api/events?${params}`);
      if (isUpcoming) {
        relatedUpcomingEvents.value = append ? [...relatedUpcomingEvents.value, ...(payload.items || [])] : payload.items || [];
        relatedUpcomingTotal.value = payload.total;
        relatedUpcomingPage.value = pageNumber;
      } else {
        relatedEndedEvents.value = append ? [...relatedEndedEvents.value, ...(payload.items || [])] : payload.items || [];
        relatedEndedTotal.value = payload.total;
        relatedEndedPage.value = pageNumber;
      }
    }

    function loadMoreRelatedEvents(bucket) {
      const section = relatedEventSections.value.find((group) => group.id === bucket);
      if (loadingRelated.value || !section?.hasMore) return;
      loadingRelated.value = true;
      loadRelatedEventBucket(bucket, bucket === "upcoming" ? relatedUpcomingPage.value + 1 : relatedEndedPage.value + 1, true)
        .catch((error) => {
          console.error(error);
        })
        .finally(() => {
        loadingRelated.value = false;
        });
    }

    function toggleRelatedSection(id) {
      const next = new Set(collapsedRelatedSections.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedRelatedSections.value = next;
    }

    async function loadSuggestions(value, scope, target) {
      const text = value.trim();
      if (text.length < 1 || !scope) {
        target.value = [];
        return;
      }
      const params = new URLSearchParams({
        q: text,
        scope,
        limit: "8"
      });
      const payload = await getJson(`/api/suggest?${params}`);
      target.value = payload.items;
    }

    async function loadQuerySuggestions(value) {
      const text = value.trim();
      if (text.length < 1) {
        querySuggestions.value = [];
        querySuggestionGroups.value = [];
        return;
      }
      const params = new URLSearchParams({
        q: text,
        scope: "events",
        limit: "8"
      });
      const payload = await getJson(`/api/suggest?${params}`);
      querySuggestions.value = payload.groups?.length ? [] : (payload.items || []);
      querySuggestionGroups.value = payload.groups || [];
    }

    async function loadGlobalSuggestions(value) {
      const text = value.trim();
      if (text.length < 1) {
        globalSuggestions.value = [];
        globalSuggestionGroups.value = [];
        return;
      }
      const params = new URLSearchParams({
        q: text,
        scope: "events",
        limit: "10"
      });
      const payload = await getJson(`/api/suggest?${params}`);
      globalSuggestions.value = payload.groups?.length ? [] : (payload.items || []);
      globalSuggestionGroups.value = payload.groups || [];
    }

    function applyQuerySuggestion(suggestion) {
      const value = typeof suggestion === "string" ? suggestion : suggestion.value;
      query.value = value;
      hideSuggestions();
      if (suggestion?.type === "artist") {
        openArtistByName(value);
      } else if (suggestion?.type === "work") {
        openWork({ title: value });
      } else if (suggestion?.type === "venue") {
        openVenueByName(value);
      } else {
        go("events");
      }
    }

    function applyGlobalSuggestion(suggestion) {
      const value = typeof suggestion === "string" ? suggestion : suggestion.value;
      globalQuery.value = value;
      showGlobalSuggestions.value = false;
      globalSuggestions.value = [];
      globalSuggestionGroups.value = [];
      if (suggestion?.type === "artist") {
        openArtistByName(value);
      } else if (suggestion?.type === "work") {
        openWork({ title: value });
      } else if (suggestion?.type === "venue") {
        openVenueByName(value);
      } else {
        query.value = value;
        go("events");
      }
    }

    function submitGlobalSearch() {
      const value = globalQuery.value.trim();
      if (!value) return;
      query.value = value;
      showGlobalSuggestions.value = false;
      go("events");
    }

    function handleGlobalInput(event) {
      globalQuery.value = event?.target?.value || "";
      showGlobalSuggestions.value = true;
      window.clearTimeout(globalSuggestionTimer);
      globalSuggestionTimer = window.setTimeout(() => {
        loadGlobalSuggestions(globalQuery.value).catch(console.error);
      }, 120);
    }

    function applyDirectorySuggestion(value) {
      directoryQuery.value = value;
      hideSuggestions();
    }

    function suggestionParts(value, needle) {
      const text = String(value || "");
      const queryText = String(needle || "").trim();
      if (!text || !queryText) return [{ text, match: false }];
      const index = text.toLowerCase().indexOf(queryText.toLowerCase());
      if (index < 0) return [{ text, match: false }];
      return [
        { text: text.slice(0, index), match: false },
        { text: text.slice(index, index + queryText.length), match: true },
        { text: text.slice(index + queryText.length), match: false }
      ].filter((part) => part.text);
    }

    function hideSuggestions() {
      showQuerySuggestions.value = false;
      showDirectorySuggestions.value = false;
      querySuggestions.value = [];
      querySuggestionGroups.value = [];
      directorySuggestions.value = [];
    }

    function hideSuggestionsSoon() {
      window.setTimeout(hideSuggestions, 120);
    }

    function hideGlobalSuggestionsSoon() {
      window.setTimeout(() => {
        showGlobalSuggestions.value = false;
      }, 140);
    }

    async function loadLists() {
      const [artistPayload, worksPayload, venuesPayload] = await Promise.all([
        getJson("/api/artists?limit=36"),
        getJson("/api/works"),
        getJson("/api/venues?limit=48")
      ]);
      artistRows.value = artistPayload.items;
      works.value = worksPayload.items;
      venues.value = venuesPayload.items;
      selectedArtist.value = artistPayload.items[0] || null;
      selectedWork.value = worksPayload.items[0] || null;
      selectedVenue.value = venuesPayload.items[0] || null;
      hydrateDirectoryRoute().catch(console.error);
    }

    async function loadDirectoryRows() {
      const params = new URLSearchParams({
        q: directoryQuery.value,
        limit: "60"
      });
      if (page.value === "artists") {
        const payload = await getJson(`/api/artists?${params}`);
        artistRows.value = payload.items;
      } else if (page.value === "works") {
        const payload = await getJson(`/api/works?${params}`);
        works.value = payload.items;
      } else if (page.value === "venues") {
        const payload = await getJson(`/api/venues?${params}`);
        venues.value = payload.items;
      }
    }

    async function loadAuthSession() {
      const payload = await getJson("/api/auth/session");
      authUser.value = payload.user || null;
      if (authUser.value) await Promise.all([loadFavorites(), loadProfile()]);
      if (authUser.value && selectedEvent.value) await loadEventNote();
      if (authUser.value?.isAdmin && page.value === "admin") await loadAdminModeration();
    }

    async function loadFavorites() {
      if (!authUser.value) {
        favoriteIds.value = new Set();
        favoriteItems.value = [];
        favoriteEntityIds.value = { artists: new Set(), works: new Set(), venues: new Set() };
        favoriteArtists.value = [];
        favoriteWorks.value = [];
        favoriteVenues.value = [];
        return;
      }
      const payload = await getJson("/api/favorites");
      favoriteIds.value = new Set(payload.ids?.events || payload.favoriteIds || []);
      favoriteEntityIds.value = {
        artists: new Set(payload.ids?.artists || []),
        works: new Set(payload.ids?.works || []),
        venues: new Set(payload.ids?.venues || [])
      };
      favoriteItems.value = payload.items || [];
      favoriteArtists.value = payload.favoriteArtists || [];
      favoriteWorks.value = payload.favoriteWorks || [];
      favoriteVenues.value = payload.favoriteVenues || [];
      syncFavoriteCalendarSelection();
    }

    async function loadProfile() {
      if (!authUser.value) return;
      const payload = await getJson("/api/profile");
      applyProfile(payload.profile || {});
    }

    async function loadPublicProfile(username) {
      publicProfileLoading.value = true;
      publicProfileError.value = "";
      try {
        const payload = await getJson(`/api/users/${encodeURIComponent(username)}`);
        publicProfile.value = payload;
      } catch (error) {
        publicProfile.value = null;
        publicProfileError.value = error?.message || "公开主页加载失败";
      } finally {
        publicProfileLoading.value = false;
      }
    }

    async function loadCalendarFeed() {
      if (!authUser.value) return;
      const payload = await getJson("/api/calendar-feed");
      calendarFeedUrl.value = payload.url || "";
      calendarWebcalUrl.value = payload.webcalUrl || "";
    }

    function applyProfile(profile) {
      profileDisplayName.value = profile.displayName || authUser.value?.displayName || "";
      profileHomeArea.value = profile.homeArea || "";
      profileFavoriteType.value = profile.favoriteType || "all";
      profileAvatarUrl.value = profile.avatarUrl || "";
      profileCoverUrl.value = profile.coverUrl || "";
      profileStatusLine.value = profile.statusLine || "";
      profileBio.value = profile.bio || "";
      profileLinks.value = profile.links || "";
      profileLinkDraftRows.value = profileLinkRowsFromText(profile.links || "");
      profileTags.value = profile.tags || "";
      profileContacts.value = profile.contacts || "";
      profileContactDraftRows.value = profileContactRowsFromText(profile.contacts || "");
      profileInterests.value = profile.interests || "";
      profileInterestDraftRows.value = profileInterestRowsFromText(profile.interests || "");
      profileVisibilityEnabled.value = profile.visibility?.enabled !== false;
      profileVisibilityLinks.value = profile.visibility?.links !== false;
      profileVisibilityContacts.value = profile.visibility?.contacts === true;
      profileVisibilityInterests.value = profile.visibility?.interests !== false;
      profileVisibilityFollows.value = profile.visibility?.follows !== false;
      profileVisibilityStats.value = profile.visibility?.stats !== false;
      activeProfileInterest.value = profileInterestRows.value[0]?.category || "";
      if (authUser.value && profileDisplayName.value) {
        authUser.value = {
          ...authUser.value,
          displayName: profileDisplayName.value
        };
      }
    }

    async function saveProfile() {
      profileSaveState.value = "保存中...";
      try {
        const nextLinks = profileLinksText();
        const nextContacts = profileContactsText();
        const nextInterests = profileInterestsText();
        const nextProfile = {
        displayName: profileDisplayName.value,
        homeArea: profileHomeArea.value,
        favoriteType: profileFavoriteType.value,
        avatarUrl: normalizeProfileUrl(profileAvatarUrl.value),
        coverUrl: normalizeProfileUrl(profileCoverUrl.value),
        statusLine: profileStatusLine.value,
          bio: profileBio.value,
          links: nextLinks,
          tags: profileTags.value,
          contacts: nextContacts,
          interests: nextInterests,
          visibility: {
            enabled: profileVisibilityEnabled.value,
            links: profileVisibilityLinks.value,
            contacts: profileVisibilityContacts.value,
            interests: profileVisibilityInterests.value,
            follows: profileVisibilityFollows.value,
            stats: profileVisibilityStats.value
          }
        };
        const payload = await postJson("/api/profile", nextProfile);
        applyProfile(payload.profile || nextProfile);
        if (authUser.value) {
          authUser.value = {
            ...authUser.value,
            displayName: profileDisplayName.value || authUser.value.displayName
          };
        }
        profileSaveState.value = "已保存";
        go("profile");
        window.setTimeout(() => {
          if (profileSaveState.value === "已保存") profileSaveState.value = "";
        }, 2200);
      } catch (error) {
        profileSaveState.value = `保存失败：${error?.message || String(error)}`;
        console.error(error);
      }
    }

    function openProfileEditor() {
      profileLinkDraftRows.value = profileLinkRowsFromText(profileLinks.value);
      profileContactDraftRows.value = profileContactRowsFromText(profileContacts.value);
      profileInterestDraftRows.value = profileInterestRowsFromText(profileInterests.value);
      window.location.hash = "#/profile/edit";
    }

    function addProfileTag() {
      const tag = profileTagInput.value.trim().replace(/^#/, "");
      if (!tag) return;
      const tags = profileTagRows.value.map((value) => value.replace(/^#/, ""));
      if (!tags.includes(tag)) tags.push(tag);
      profileTags.value = tags.join("、");
      profileTagInput.value = "";
    }

    function removeProfileTag(tag) {
      const normalized = String(tag || "").replace(/^#/, "");
      profileTags.value = profileTagRows.value
        .map((value) => value.replace(/^#/, ""))
        .filter((value) => value !== normalized)
        .join("、");
    }

    function addProfileLink() {
      profileLinkDraftRows.value.push({ label: "", url: "" });
    }

    function removeProfileLink(index) {
      profileLinkDraftRows.value.splice(index, 1);
    }

    function addProfileContact() {
      profileContactDraftRows.value.push({ label: "", value: "" });
    }

    function removeProfileContact(index) {
      profileContactDraftRows.value.splice(index, 1);
    }

    function addProfileInterest() {
      profileInterestDraftRows.value.push({ category: "", title: "", imageUrl: "", note: "" });
    }

    function removeProfileInterest(index) {
      profileInterestDraftRows.value.splice(index, 1);
    }

    function profileLinksText() {
      return profileLinkDraftRows.value
        .map((link) => ({
          label: String(link.label || "").trim(),
          url: normalizeProfileUrl(link.url)
        }))
        .filter((link) => link.url)
        .map((link) => `${link.label} ${link.url}`.trim())
        .join("\n");
    }

    function profileContactsText() {
      return profileContactDraftRows.value
        .map((row) => ({
          label: String(row.label || "").trim(),
          value: String(row.value || "").trim()
        }))
        .filter((row) => row.label || row.value)
        .map((row) => `${row.label} | ${row.value}`.trim())
        .join("\n");
    }

    function profileInterestsText() {
      return profileInterestDraftRows.value
        .map((row) => ({
          category: String(row.category || "").trim(),
          title: String(row.title || "").trim(),
          imageUrl: normalizeProfileUrl(row.imageUrl),
          note: String(row.note || "").trim()
        }))
        .filter((row) => row.category || row.title || row.imageUrl || row.note)
        .map((row) => `${row.category || "兴趣"} | ${row.title || "未命名"} | ${row.imageUrl} | ${row.note}`.trim())
        .join("\n");
    }

    async function copyProfileContact(value) {
      const text = String(value || "").trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        profileCopyState.value = `已复制：${text}`;
      } catch {
        profileCopyState.value = `复制失败：${text}`;
      }
      window.setTimeout(() => {
        if (profileCopyState.value.includes(text)) profileCopyState.value = "";
      }, 2200);
    }

    function syncFavoriteCalendarSelection() {
      if (favoriteItems.value.length === 0) return;
      if (favoriteEventsByDate.value.has(favoriteSelectedDate.value)) return;
      const firstUpcoming = favoriteItems.value.find((event) => event.date >= initialDate) || favoriteItems.value[0];
      if (!firstUpcoming?.date) return;
      favoriteSelectedDate.value = firstUpcoming.date;
      favoriteMonth.value = firstUpcoming.date.slice(0, 7);
    }

    async function submitAuth() {
      authLoading.value = true;
      authError.value = "";
      try {
        const payload = await postJson(`/api/auth/${authMode.value}`, {
          username: authUsername.value,
          displayName: authDisplayName.value,
          password: authPassword.value
        });
        authUser.value = payload.user;
        authPassword.value = "";
        await Promise.all([loadFavorites(), loadProfile()]);
        if (authUser.value?.isAdmin && page.value === "admin") await loadAdminModeration();
      } catch (error) {
        authError.value = error?.message || String(error);
      } finally {
        authLoading.value = false;
      }
    }

    async function logout() {
      authLoading.value = true;
      authError.value = "";
      try {
        await postJson("/api/auth/logout");
        authUser.value = null;
        adminModeration.value = { pendingCorrections: [], recentQuestions: [], currentUser: null };
        calendarFeedUrl.value = "";
        calendarWebcalUrl.value = "";
        favoriteIds.value = new Set();
        favoriteItems.value = [];
        favoriteEntityIds.value = { artists: new Set(), works: new Set(), venues: new Set() };
        favoriteArtists.value = [];
        favoriteWorks.value = [];
        favoriteVenues.value = [];
        eventNoteStatus.value = "none";
        eventNoteMemo.value = "";
        authPassword.value = "";
      } catch (error) {
        authError.value = error?.message || String(error);
      } finally {
        authLoading.value = false;
      }
    }

    function go(target) {
      const nextPage = target || "home";
      page.value = nextPage;
      routeParam.value = "";
      if (window.location.hash !== `#/${nextPage}`) {
        window.location.hash = `#/${nextPage}`;
      }
      syncRouteFromHash();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function isNavActive(id) {
      const parentMap = {
        artist: "artists",
        work: "works",
        venue: "venues",
        event: "events"
      };
      return (parentMap[page.value] || page.value) === id;
    }

    function quickSearch(value) {
      query.value = value;
      go("events");
    }

    async function openEvent(event) {
      selectedEvent.value = event;
      showAllEventArtists.value = false;
      showCorrectionPanel.value = false;
      loadEventNote().catch(console.error);
      loadEventExtra().catch(console.error);
      loadEventTicketReference().catch(console.error);
      loadEventInteractions().catch(console.error);
      eventReturnPage.value = ["artist", "work", "venue"].includes(page.value) ? page.value : "events";
      if (event.sourceEventId) {
        try {
          const payload = await getJson(`/api/event?sourceEventId=${encodeURIComponent(event.sourceEventId)}`);
          selectedEvent.value = payload.item;
          showAllEventArtists.value = false;
          showCorrectionPanel.value = false;
          loadEventNote().catch(console.error);
          loadEventExtra().catch(console.error);
          loadEventTicketReference().catch(console.error);
          loadEventInteractions().catch(console.error);
        } catch (error) {
          console.error(error);
        }
      }
      page.value = "event";
      if (window.location.hash !== `#/event/${event.sourceEventId}`) {
        window.location.hash = `#/event/${event.sourceEventId}`;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function openEventInline(event) {
      if (window.matchMedia("(max-width: 640px)").matches) {
        openEvent(event);
        return;
      }
      selectedEvent.value = event;
      showAllEventArtists.value = false;
      showCorrectionPanel.value = false;
      loadEventNote().catch(console.error);
      loadEventExtra().catch(console.error);
      loadEventTicketReference().catch(console.error);
      loadEventInteractions().catch(console.error);
      if (!event.sourceEventId) return;
      try {
        const payload = await getJson(`/api/event?sourceEventId=${encodeURIComponent(event.sourceEventId)}`);
        selectedEvent.value = payload.item;
        loadEventNote().catch(console.error);
        loadEventExtra().catch(console.error);
        loadEventTicketReference().catch(console.error);
        loadEventInteractions().catch(console.error);
      } catch (error) {
        console.error(error);
      }
    }

    function backFromEventDetail() {
      if (["artist", "work", "venue"].includes(eventReturnPage.value)) {
        page.value = eventReturnPage.value;
        routeParam.value = "";
        window.location.hash = `#/${eventReturnPage.value}`;
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (selectedEvent.value?.date) {
        selectedDate.value = selectedEvent.value.date;
        currentMonth.value = selectedEvent.value.date.slice(0, 7);
        page.value = "events";
        routeParam.value = selectedEvent.value.date;
        if (window.location.hash !== `#/events/${selectedEvent.value.date}`) {
          window.location.hash = `#/events/${selectedEvent.value.date}`;
        }
        loadCalendar().catch((error) => {
          loading.value = false;
          console.error(error);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      go("events");
    }

    async function openArtistByName(name) {
      const artist = artistRows.value.find((item) => item.name === name);
      if (artist) openArtist(artist);
      else {
        const params = new URLSearchParams({ q: name, limit: "5" });
        const payload = await getJson(`/api/artists?${params}`);
        const exact = payload.items.find((item) => item.name === name);
        openArtist({
          ...(exact || {}),
          name,
          role: exact?.role || "Eventernote 出演者",
          follows: exact?.follows || 0,
          next: ""
        });
      }
    }

    function openArtist(artist) {
      selectedArtist.value = artist;
      loadRelatedEvents(artist.name).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
      page.value = "artist";
      window.location.hash = `#/artist/${encodeURIComponent(artist.name)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openWork(work) {
      selectedWork.value = work;
      loadRelatedEvents(work.title).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
      page.value = "work";
      window.location.hash = `#/work/${encodeURIComponent(work.title)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openVenue(venue) {
      selectedVenue.value = venue;
      loadRelatedEvents(venue.name).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
      page.value = "venue";
      window.location.hash = `#/venue/${encodeURIComponent(venue.id)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function openVenueByName(name) {
      const params = new URLSearchParams({ q: name, limit: "8" });
      const payload = await getJson(`/api/venues?${params}`);
      const exact = payload.items.find((item) => item.name === name) || payload.items[0];
      openVenue(exact || {
        id: `search-${encodeURIComponent(name)}`,
        name,
        area: "搜索建议",
        events: 0,
        sourceUrl: ""
      });
    }

    async function openEventVenue(event) {
      const venue = venues.value.find((item) => item.id === event.venueId || item.name === event.venue) || {
        id: event.venueId,
        name: event.venue,
        area: "Eventernote 活动记录",
        events: 0,
        sourceUrl: ""
      };
      const params = new URLSearchParams({ q: event.venue, limit: "8" });
      const payload = await getJson(`/api/venues?${params}`);
      const exact = payload.items.find((item) => item.id === event.venueId || item.name === event.venue);
      openVenue(exact || venue);
    }

    async function openEventWork(event) {
      if (!isConcreteWorkTitle(event.work)) return;
      const work = works.value.find((item) => item.title === event.work) || {
        id: event.workId,
        title: event.work,
        category: "作品/企划",
        trend: "从当前活动进入的作品聚合",
        events: 0
      };
      const params = new URLSearchParams({ q: event.work, limit: "8" });
      const payload = await getJson(`/api/works?${params}`);
      const exact = payload.items.find((item) => item.title === event.work || item.id === event.workId);
      openWork(exact || work);
    }

    async function hydrateDirectoryRoute() {
      const param = routeParamFromHash();
      if (!param) return;
      if (page.value === "artist") {
        let artist = artistRows.value.find((item) => item.name === param);
        if (!artist) {
          const payload = await getJson(`/api/artists?${new URLSearchParams({ q: param, limit: "8" })}`);
          artist = payload.items.find((item) => item.name === param) || payload.items[0];
        }
        if (artist) {
          selectedArtist.value = artist;
          loadRelatedEvents(artist.name).catch((error) => {
            loadingRelated.value = false;
            console.error(error);
          });
        }
      }
      if (page.value === "work") {
        let work = works.value.find((item) => item.title === param);
        if (!work) {
          const payload = await getJson(`/api/works?${new URLSearchParams({ q: param, limit: "8" })}`);
          work = payload.items.find((item) => item.title === param || item.id === param) || payload.items[0];
        }
        if (work) {
          selectedWork.value = work;
          loadRelatedEvents(work.title).catch((error) => {
            loadingRelated.value = false;
            console.error(error);
          });
        }
      }
      if (page.value === "venue") {
        let venue = venues.value.find((item) => item.id === param || item.name === param);
        if (!venue) {
          const payload = await getJson(`/api/venues?${new URLSearchParams({ q: param, limit: "8" })}`);
          venue = payload.items.find((item) => item.id === param || item.name === param) || payload.items[0];
        }
        if (venue) {
          selectedVenue.value = venue;
          loadRelatedEvents(venue.name).catch((error) => {
            loadingRelated.value = false;
            console.error(error);
          });
        }
      }
    }

    function isDateInCurrentMonth(dateString) {
      return /^\d{4}-\d{2}-\d{2}$/.test(dateString) && dateString.slice(0, 7) === currentMonth.value;
    }

    function changeMonth(offset) {
      const [year, month] = currentMonth.value.split("-").map(Number);
      const next = new Date(year, month - 1 + offset, 1);
      currentMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      selectedDate.value = `${currentMonth.value}-01`;
      window.location.hash = `#/events/${selectedDate.value}`;
      loadCalendar().catch((error) => {
        loading.value = false;
        console.error(error);
      });
    }

    function setYear(year) {
      const month = currentMonth.value.slice(5, 7);
      currentMonth.value = `${year}-${month}`;
      selectedDate.value = `${currentMonth.value}-01`;
      window.location.hash = `#/events/${selectedDate.value}`;
      loadCalendar().catch((error) => {
        loading.value = false;
        console.error(error);
      });
    }

    function selectDate(date) {
      if (!date) return;
      selectedDate.value = date;
      if (window.location.hash !== `#/events/${date}`) {
        window.location.hash = `#/events/${date}`;
      }
      const month = date.slice(0, 7);
      if (month !== currentMonth.value) {
        currentMonth.value = month;
        loadCalendar().catch((error) => {
          loading.value = false;
          console.error(error);
        });
        return;
      }
      loadCalendar().catch((error) => {
        loading.value = false;
        console.error(error);
      });
    }

    function changeFavoriteMonth(offset) {
      const months = [...favoriteMonthOptions.value].sort((a, b) => a.localeCompare(b));
      if (months.length === 0) return;
      const currentIndex = Math.max(0, months.indexOf(favoriteMonth.value));
      const nextIndex = Math.min(months.length - 1, Math.max(0, currentIndex + offset));
      setFavoriteMonth(months[nextIndex]);
    }

    function setFavoriteMonth(month) {
      if (!month) return;
      favoriteMonth.value = month;
      favoriteSelectedDate.value = `${favoriteMonth.value}-01`;
      const firstSavedInMonth = favoriteItems.value.find((event) => event.date?.startsWith(favoriteMonth.value));
      if (firstSavedInMonth?.date) favoriteSelectedDate.value = firstSavedInMonth.date;
    }

    function selectFavoriteDate(date) {
      if (!date) return;
      favoriteSelectedDate.value = date;
      favoriteMonth.value = date.slice(0, 7);
    }

    function resetFavoriteFilters() {
      favoriteStatusFilter.value = "all";
      favoritePeriodFilter.value = "all";
      favoriteAreaFilter.value = "all";
    }

    function eventFavoriteKey(event) {
      return event?.sourceEventId || "";
    }

    function isJoined(event) {
      const key = eventFavoriteKey(event);
      return key ? favoriteIds.value.has(key) : false;
    }

    function isEntityFavorite(type, key) {
      return favoriteEntityIds.value[type]?.has(key) || false;
    }

    async function toggleEntityFavorite(type, key) {
      if (!authUser.value) {
        go("profile");
        return;
      }
      if (!key) return;
      const payload = isEntityFavorite(type, key)
        ? await deleteJson("/api/favorites", { type, key })
        : await postJson("/api/favorites", { type, key });
      favoriteIds.value = new Set(payload.ids?.events || payload.favoriteIds || []);
      favoriteEntityIds.value = {
        artists: new Set(payload.ids?.artists || []),
        works: new Set(payload.ids?.works || []),
        venues: new Set(payload.ids?.venues || [])
      };
      favoriteItems.value = payload.items || [];
      favoriteArtists.value = payload.favoriteArtists || [];
      favoriteWorks.value = payload.favoriteWorks || [];
      favoriteVenues.value = payload.favoriteVenues || [];
      syncFavoriteCalendarSelection();
    }

    async function toggleJoin(event) {
      if (!authUser.value) {
        go("profile");
        return;
      }
      const sourceEventId = eventFavoriteKey(event);
      if (!sourceEventId) return;
      try {
        const wasJoined = isJoined(event);
        const payload = wasJoined
          ? await deleteJson("/api/favorites", { sourceEventId })
          : await postJson("/api/favorites", { sourceEventId });
        favoriteIds.value = new Set(payload.ids?.events || payload.favoriteIds || []);
        favoriteEntityIds.value = {
          artists: new Set(payload.ids?.artists || []),
          works: new Set(payload.ids?.works || []),
          venues: new Set(payload.ids?.venues || [])
        };
        favoriteItems.value = payload.items || [];
        favoriteArtists.value = payload.favoriteArtists || [];
        favoriteWorks.value = payload.favoriteWorks || [];
        favoriteVenues.value = payload.favoriteVenues || [];
        if (selectedEvent.value?.sourceEventId === sourceEventId) {
          if (wasJoined && eventNoteStatus.value === "want" && !eventNoteMemo.value.trim()) {
            eventNoteStatus.value = "none";
          } else if (!wasJoined && eventNoteStatus.value === "none") {
            eventNoteStatus.value = "want";
          }
        }
        syncFavoriteCalendarSelection();
        loadEventInteractions().catch(console.error);
      } catch (error) {
        authError.value = error?.message || String(error);
        console.error(error);
      }
    }

    function openSameDay(event) {
      if (!event?.date) return;
      selectedDate.value = event.date;
      currentMonth.value = event.date.slice(0, 7);
      go("events");
      window.location.hash = `#/events/${event.date}`;
    }

    function mapUrlForVenue(venueName) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayVenue(venueName))}`;
    }

    function saveMemo() {
      saveNotebook({
        budget: budget.value,
        memo: memo.value
      });
      saveState.value = `已保存。本月预算 ¥${Number(budget.value || 0).toLocaleString("ja-JP")}`;
    }

    function hydrateNotebook() {
      const saved = loadNotebook();
      if (saved.budget !== undefined) budget.value = saved.budget;
      if (typeof saved.memo === "string") memo.value = saved.memo;
    }

    document.addEventListener("click", (event) => {
      const clickedElement = event.target instanceof Element ? event.target : event.target.parentElement;
      const calendarDay = clickedElement?.closest("[data-calendar-date]");
      if (calendarDay) {
        event.preventDefault();
        selectDate(calendarDay.dataset.calendarDate);
      }
    }, true);

    let currentRouteKey = "";

    function syncRouteFromHash() {
      let nextPage = routePageFromHash();
      const nextParam = routeParamFromHash();
      if (nextPage === "account") {
        nextPage = "profile";
        if (window.location.hash !== "#/profile") window.location.hash = "#/profile";
      }
      const nextRouteKey = `${nextPage}/${nextParam}`;
      if (nextRouteKey === currentRouteKey && page.value === nextPage) return;
      currentRouteKey = nextRouteKey;
      page.value = nextPage;
      routeParam.value = nextParam;
      if (nextPage === "profile" && nextParam === "edit" && authUser.value) {
        profileLinkDraftRows.value = profileLinkRowsFromText(profileLinks.value);
        profileContactDraftRows.value = profileContactRowsFromText(profileContacts.value);
        profileInterestDraftRows.value = profileInterestRowsFromText(profileInterests.value);
      }
      if (nextPage === "events" && /^\d{4}-\d{2}-\d{2}$/.test(nextParam)) {
        selectedDate.value = nextParam;
        currentMonth.value = nextParam.slice(0, 7);
        loadCalendar().catch((error) => {
          loading.value = false;
          console.error(error);
        });
      } else if (nextPage === "event") {
        loadEventBySourceId(nextParam).catch(console.error);
      } else if (nextPage === "users" || window.location.hash.startsWith("#/users/")) {
        loadPublicProfile(nextParam).catch(console.error);
      } else if (nextPage === "admin") {
        loadAdminModeration().catch(console.error);
      } else {
        hydrateDirectoryRoute().catch(console.error);
      }
    }

    window.addEventListener("hashchange", syncRouteFromHash);
    window.setInterval(syncRouteFromHash, 120);

    watch(page, () => {
      directoryQuery.value = "";
      document.body.classList.toggle("event-route", page.value === "event");
      if (page.value === "sources") {
        loadEvents().catch((error) => {
          loading.value = false;
          console.error(error);
        });
      } else if (page.value === "admin") {
        loadAdminModeration().catch(console.error);
      }
    }, { immediate: true });

    watch(isAccountPage, (active) => {
      document.body.classList.toggle("account-route", active);
    }, { immediate: true });

    watch([query, city, eventType], () => {
      Promise.all([loadCalendar(), loadYearOverview()]).catch((error) => {
        loading.value = false;
        loadError.value = error?.message || String(error);
        console.error(error);
      });
    });

    let querySuggestionTimer = 0;
    let globalSuggestionTimer = 0;
    let directorySuggestionTimer = 0;
    let directoryRowsTimer = 0;

    watch(globalQuery, (value) => {
      window.clearTimeout(globalSuggestionTimer);
      globalSuggestionTimer = window.setTimeout(() => {
        loadGlobalSuggestions(value).catch(console.error);
      }, 160);
    });

    watch(query, (value) => {
      window.clearTimeout(querySuggestionTimer);
      querySuggestionTimer = window.setTimeout(() => {
        loadQuerySuggestions(value).catch(console.error);
      }, 180);
    });

    watch([directoryQuery, page], ([value]) => {
      window.clearTimeout(directorySuggestionTimer);
      window.clearTimeout(directoryRowsTimer);
      directorySuggestionTimer = window.setTimeout(() => {
        loadSuggestions(value, directorySuggestionScope.value, directorySuggestions).catch(console.error);
      }, 180);
      directoryRowsTimer = window.setTimeout(() => {
        loadDirectoryRows().catch(console.error);
      }, 180);
    });

    watch(relatedEventType, () => {
      loadRelatedEvents(currentRelatedQuery()).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
    });

    Promise.all([loadMeta(), loadCalendar(), loadYearOverview(), loadLists(), loadAuthSession()]).catch((error) => {
      loading.value = false;
      loadError.value = error?.message || String(error);
      console.error(error);
    });
    hydrateNotebook();

    if (page.value === "event") {
      loadEventBySourceId(routeParamFromHash()).catch(console.error);
    } else if (page.value === "sources") {
      loadEvents().catch(console.error);
    } else if (page.value === "users" || window.location.hash.startsWith("#/users/")) {
      loadPublicProfile(routeParamFromHash()).catch(console.error);
    }

    function yearTotal(year) {
      return calendarYears.value.find((row) => row.year === year)?.total || 0;
    }

    function monthLabel(monthKey) {
      const [year, month] = String(monthKey || "").split("-");
      return year && month ? `${year}年${Number(month)}月` : monthKey;
    }

    function parseProfileLink(row) {
      const text = String(row || "").trim();
      if (!text) return null;
      const urlMatch = text.match(/(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+[^\s]*/);
      if (!urlMatch) return null;
      const rawUrl = urlMatch[0];
      const url = normalizeProfileUrl(rawUrl);
      const label = text.replace(rawUrl, "").trim() || linkLabelFromUrl(url);
      return { label, url };
    }

    function normalizeProfileUrl(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      if (/^https?:\/\//i.test(text)) return text;
      return `https://${text}`;
    }

    function parseLabelValueRow(row) {
      const text = String(row || "").trim();
      if (!text) return null;
      const [label, ...rest] = text.split("|").map((part) => part.trim());
      const value = rest.join(" | ").trim();
      if (!label && !value) return null;
      return { label: label || "联系方式", value: value || label };
    }

    function parseInterestRow(row) {
      const text = String(row || "").trim();
      if (!text) return null;
      const [category, title, ...rest] = text.split("|").map((part) => part.trim());
      const firstRest = rest[0] || "";
      const hasImage = /^(https?:\/\/)?(?:[\w-]+\.)+[\w-]+/i.test(firstRest);
      const imageUrl = hasImage ? normalizeProfileUrl(firstRest) : "";
      const note = (hasImage ? rest.slice(1) : rest).join(" | ").trim();
      if (!category && !title && !note) return null;
      return {
        category: category || "兴趣",
        title: title || "未命名",
        imageUrl,
        note
      };
    }

    function profileLinkRowsFromText(text) {
      const rows = String(text || "")
        .split("\n")
        .map(parseProfileLink)
        .filter(Boolean);
      return rows.length ? rows : [{ label: "", url: "" }];
    }

    function profileContactRowsFromText(text) {
      const rows = String(text || "")
        .split("\n")
        .map(parseLabelValueRow)
        .filter(Boolean);
      return rows.length ? rows : [{ label: "", value: "" }];
    }

    function profileInterestRowsFromText(text) {
      const rows = String(text || "")
        .split("\n")
        .map(parseInterestRow)
        .filter(Boolean);
      return rows.length ? rows : [{ category: "", title: "", note: "" }];
    }

    function linkLabelFromUrl(url) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (host.includes("twitter.com") || host.includes("x.com")) return "X";
        if (host.includes("instagram.com")) return "Instagram";
        if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
        if (host.includes("github.com")) return "GitHub";
        return host;
      } catch {
        return "Link";
      }
    }

    return {
      applyDirectorySuggestion,
      applyQuerySuggestion,
      actionInfoSummary,
      artists: artistRows,
      artistHistoricalTotal,
      authDisplayName,
      authError,
      authLoading,
      authMode,
      authPassword,
      authUser,
      authUsername,
      adminError,
      adminLoading,
      adminPendingCorrections,
      adminRecentQuestions,
      backFromEventDetail,
      budget,
      canReviewCorrections,
      city,
      cityOptions,
      calendarCells,
      calendarFeedUrl,
      calendarTitle,
      calendarTotal,
      calendarWebcalUrl,
      changeFavoriteMonth,
      changeMonth,
      collapsedArtistLimit,
      compactMonthDay,
      currentMonth,
      currentYear,
      confirmCorrection,
      correctionField,
      correctionFieldOptions,
      correctionNote,
      correctionSourceUrl,
      correctionStatusLabel,
      correctionValue,
      dataSources,
      dataFreshnessLabel,
      dataFreshnessSummary,
      dayEventTotal,
      dayEvents,
      desktopDateStrip,
      deleteAnswer,
      deleteQuestion,
      directorySuggestions,
      directoryQuery,
      eventBackLabel,
      eventCardArtistSummary,
      eventCardTags,
      eventListFilter,
      eventListFilterOptions,
      eventListStatusLabel,
      eventType,
      events,
      eventDisplayTags,
      eventCorrections,
      eventExtra,
      eventInteractions,
      eventNoteStatusLabel,
      eventNoteMemo,
      eventNoteSaveState,
      eventNoteStatus,
      eventNoteStatusOptions,
      eventQuestions,
      eventSourceSummary,
      eventStatusStats,
      favoriteArtists,
      favoriteCalendarCells,
      favoriteCalendarTitle,
      favoriteDoneCount,
      filteredDayEvents,
      favoriteEndedItems,
      favoriteAreaFilter,
      favoriteAreaOptions,
      favoriteFilteredItems,
      favoriteItems,
      favoriteMonthOptions,
      favoriteMonthTotal,
      favoriteMonth,
      favoritePeriodFilter,
      favoritePlanningCount,
      favoriteSelectedDate,
      favoriteSelectedDateLabel,
      favoriteStatusFilter,
      favoriteStatusGroups,
      favoriteUpcomingItems,
      favoriteVenues,
      favoriteWorks,
      followedEntityCount,
      followedCount,
      hasQuerySuggestions,
      homeEvents,
      displayVenue,
      displayArtists,
      formatDetailDate,
      formatDate,
      go,
      globalQuery,
      globalSuggestionGroups,
      globalSuggestions,
      hasGlobalSuggestions,
      handleGlobalInput,
      hideGlobalSuggestionsSoon,
      hideSuggestions,
      hideSuggestionsSoon,
      hideAdminCorrection,
      hideAdminQuestion,
      hideCorrection,
      isConcreteWorkTitle,
      isAccountPage,
      isEntityFavorite,
      isJoined,
      isNavActive,
      isUpcomingSelectedEvent,
      interactionSaveState,
      isPublicProfilePage,
      isProfileEditPage,
      loading,
      loadError,
      loadAdminModeration,
      loadCalendarFeed,
      loadEventTicketReference,
      loadMoreRelatedEvents,
      loadingRelated,
      mapUrlForVenue,
      meta,
      mobileNavItems,
      memo,
      monthLabel,
      mySection,
      navItems,
      nextPlanLabel,
      openAdminEvent,
      openArtist,
      openArtistByName,
      openEvent,
      openEventInline,
      openEventVenue,
      openEventWork,
      openProfileEditor,
      openSameDay,
      openVenue,
      openWork,
      page,
      plannedCount,
      pagedTicketReferenceListings,
      profileBio,
      profileAvatarUrl,
      profileCoverUrl,
      profileContactDraftRows,
      profileContactRows,
      profileContacts,
      profileCopyState,
      profileDisplayName,
      profileFavoriteType,
      profileHomeArea,
      profileInterestDraftRows,
      profileInterestGroups,
      profileInterestRows,
      profileInterests,
      profileVisibilityContacts,
      profileVisibilityEnabled,
      profileVisibilityFollows,
      profileVisibilityInterests,
      profileVisibilityLinks,
      profileVisibilityStats,
      publicProfile,
      publicProfileContactRows,
      publicProfileData,
      publicProfileError,
      publicProfileInterestGroups,
      publicProfileLinkRows,
      publicProfileLoading,
      publicProfileTagRows,
      publicProfileUrl,
      publicProfileVisibility,
      profileLinkDraftRows,
      profileLinkRows,
      profileLinks,
      profileSaveState,
      profileStatusLine,
      profileTagInput,
      profileTagRows,
      profileTags,
      activeProfileInterest,
      activeProfileInterestItems,
      query,
      querySuggestionGroups,
      questionDraft,
      querySuggestions,
      quickSearch,
      relatedEvents,
      relatedEventSections,
      relatedEventTotal,
      relatedEventType,
      addProfileContact,
      addProfileInterest,
      addProfileLink,
      addProfileTag,
      copyProfileContact,
      removeProfileContact,
      removeProfileInterest,
      removeProfileLink,
      removeProfileTag,
      reviewAdminCorrection,
      reviewCorrection,
      resetFavoriteFilters,
      saveEventNote,
      saveMemo,
      saveProfile,
      saveState,
      selectDate,
      selectFavoriteDate,
      selectedArtist,
      selectedFavoriteItems,
      selectedDate,
      selectedDateLabel,
      selectedEvent,
      selectedVenue,
      selectedWork,
      setFavoriteMonth,
      setYear,
      showAllEventArtists,
      showCorrectionPanel,
      showDirectorySuggestions,
      showGlobalSuggestions,
      showMobileFilters,
      showQuerySuggestions,
      logout,
      applyGlobalSuggestion,
      submitAuth,
      submitAnswer,
      submitCorrection,
      submitGlobalSearch,
      submitQuestion,
      suggestionParts,
      ticketReference,
      ticketReferenceCacheLabel,
      ticketReferenceCheckedLabel,
      ticketReferenceListings,
      ticketReferenceLoading,
      ticketReferencePage,
      ticketReferencePageCount,
      ticketReferenceStatusLabel,
      ticketReferenceTrustNote,
      toggleEntityFavorite,
      toggleJoin,
      toggleRelatedSection,
      typeLabel,
      typeOptions,
      upcomingFavoriteItems,
      venueHistoricalTotal,
      venues,
      visibleNavItems,
      visibleArtists,
      visibleEventArtists,
      visibleVenues,
      visibleWorks,
      weekdays,
      works,
      yearOptions,
      yearTotal
    };
  }
}).mount("#app");
