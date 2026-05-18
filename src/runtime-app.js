import { computed, createApp, ref, watch } from "/node_modules/vue/dist/vue.esm-browser.js";
import { getJson } from "./api.js";
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
    <nav class="nav" aria-label="主导航">
      <a v-for="item in navItems" :key="item.id" :href="\`#/\${item.id}\`" :class="{ active: isNavActive(item.id) }" @click="go(item.id)">
        {{ item.label }}
      </a>
    </nav>
    <div class="top-actions">
      <button class="icon-button" type="button" aria-label="通知">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M13.7 21a2 2 0 0 1-3.4 0"></path>
        </svg>
      </button>
      <button class="primary-button" type="button" @click="go('events')">查活动</button>
    </div>
  </header>

  <nav class="mobile-tabs" aria-label="移动导航">
    <a v-for="item in navItems" :key="item.id" :href="\`#/\${item.id}\`" :class="{ active: isNavActive(item.id) }" @click="go(item.id)">
      {{ item.short }}
    </a>
  </nav>

  <main class="page-shell">
    <section v-if="page === 'home'" class="home-page">
      <section class="mobile-dashboard home-overview">
        <div class="app-greeting">
          <div>
            <p>Anime / Seiyuu Archive</p>
            <h1>活动资料库</h1>
          </div>
        </div>

        <section class="wallet-card">
          <div>
            <span>历史活动</span>
            <strong>{{ meta.events?.toLocaleString("ja-JP") || "..." }}</strong>
          </div>
          <p>Eventernote historical archive</p>
          <small>{{ selectedDate }} · 本月 {{ calendarTotal.toLocaleString("ja-JP") }} 场</small>
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

      <section class="home-sections">
        <div class="content-grid">
          <div class="section-head">
            <div>
              <p class="eyebrow">Today pick</p>
              <h2>{{ selectedDateLabel }}</h2>
            </div>
            <button class="ghost-button" type="button" @click="go('events')">View All</button>
          </div>
          <div class="event-list compact">
        <article v-for="event in dayEvents.slice(0, 5)" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
              <div class="date-box">
                <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
              </div>
              <div>
                <h3 class="event-title">{{ event.title }}</h3>
                <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="displayArtists(event).length">{{ displayArtists(event).join(" / ") }}</span></div>
                <div class="tag-row">
                  <span class="tag source-tag">{{ event.sourceName }}</span>
                  <span v-for="tag in event.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
              <button class="primary-button join-button" :class="{ joined: isJoined(event.title) }" type="button" @click.stop="toggleJoin(event.title)">
                {{ isJoined(event.title) ? "已参加" : "参加予定" }}
              </button>
            </article>
            <p v-if="dayEvents.length === 0" class="muted">{{ loading ? "加载中..." : "这一天没有活动。" }}</p>
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

    <section v-if="page === 'events'" class="page-view">
      <div class="page-title">
        <div>
          <p class="eyebrow">Schedule</p>
          <h1>活动</h1>
        </div>
      </div>

      <form class="filter-bar" @submit.prevent>
        <label class="search-field">
          <span>关键词</span>
          <div class="search-input-wrap">
            <input v-model="query" type="search" placeholder="声优、作品、会场" @focus="showQuerySuggestions = true" @keydown.enter="hideSuggestions" @change="hideSuggestions" @blur="hideSuggestionsSoon">
            <button v-if="query" class="clear-search-button" type="button" aria-label="清空关键词" @click="query = ''">x</button>
            <div v-if="showQuerySuggestions && querySuggestions.length" class="suggestion-list">
              <button v-for="suggestion in querySuggestions" :key="suggestion" type="button" @pointerdown.prevent="applyQuerySuggestion(suggestion)">
                {{ suggestion }}
              </button>
            </div>
          </div>
        </label>
        <label class="search-field">
          <span>地区</span>
          <select v-model="city">
            <option v-for="[value, label] in cityOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="search-field">
          <span>类型</span>
          <select v-model="eventType">
            <option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <p v-if="loadError" class="load-error">{{ loadError }}</p>
      </form>

      <section class="calendar-panel">
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

      <div class="section-head day-head">
        <div>
          <p class="eyebrow">Day events</p>
          <h2>{{ selectedDateLabel }}</h2>
        </div>
        <span class="muted">{{ dayEventTotal.toLocaleString("ja-JP") }} 场</span>
      </div>

      <div class="event-list">
        <article v-for="event in dayEvents" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
          <div class="date-box">
            <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
          </div>
          <div>
            <h3 class="event-title">{{ event.title }}</h3>
            <div class="event-meta">
              <span v-if="isConcreteWorkTitle(event.work)">{{ event.work }}</span>
              <span>{{ displayVenue(event.venue) }}</span>
              <span v-if="displayArtists(event).length">{{ displayArtists(event).join(" / ") }}</span>
            </div>
            <div class="tag-row">
              <span class="tag status-tag">{{ event.status }}</span>
              <span class="tag source-tag">{{ event.sourceName }} · {{ event.verifiedAt }}</span>
              <span v-for="tag in eventDisplayTags(event)" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>
          <button class="primary-button join-button" type="button" @click.stop="openEvent(event)">
            查看详情
          </button>
        </article>
        <p v-if="dayEvents.length === 0" class="muted">{{ loading ? "加载中..." : "这一天没有匹配活动。" }}</p>
      </div>
      <p class="muted result-note">日历按月分页，点击日期查看当天所有活动；全量活动仍在后端。</p>
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
        <div class="event-detail-main">
          <p class="eyebrow">{{ selectedEvent.status }}</p>
          <h2>{{ selectedEvent.title }}</h2>
          <div class="tag-row">
            <span class="tag status-tag">{{ typeLabel(selectedEvent.type) }}</span>
            <span v-for="tag in eventDisplayTags(selectedEvent)" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div>
            <span>日期</span>
            <strong>{{ formatDetailDate(selectedEvent.date) }}</strong>
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
            <span>来源</span>
            <strong>{{ selectedEvent.sourceName }}</strong>
          </div>
        </div>

        <section class="panel detail-section">
          <div class="panel-head">
            <h2>出演者</h2>
            <span class="muted">{{ selectedEvent.artists.length.toLocaleString("ja-JP") }} 人 / 组</span>
          </div>
          <div class="performer-list">
            <button v-for="artist in selectedEvent.artists" :key="artist" type="button" @click="openArtistByName(artist)">
              {{ artist }}
            </button>
          </div>
        </section>

        <div class="detail-actions">
          <a class="primary-button link-button" :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">打开 Eventernote</a>
          <button class="secondary-button" type="button" @click="openEventVenue(selectedEvent)">同会场活动</button>
          <button v-if="isConcreteWorkTitle(selectedEvent.work)" class="ghost-button" type="button" @click="openEventWork(selectedEvent)">同作品活动</button>
        </div>
      </section>

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
          <span class="muted">{{ relatedEventTotal.toLocaleString("ja-JP") }} 场匹配</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div class="event-list compact">
          <article v-for="event in relatedEvents" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
            <div class="date-box">
              <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
            </div>
            <div>
              <h3 class="event-title">{{ event.title }}</h3>
              <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="displayArtists(event).length">{{ displayArtists(event).join(" / ") }}</span></div>
            </div>
          </article>
          <p v-if="relatedEvents.length === 0" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
        </div>
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
          <span class="muted">{{ relatedEventTotal.toLocaleString("ja-JP") }} 场匹配</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div class="event-list compact">
          <article v-for="event in relatedEvents" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
            <div class="date-box">
              <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
            </div>
            <div>
              <h3 class="event-title">{{ event.title }}</h3>
              <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="displayArtists(event).length">{{ displayArtists(event).join(" / ") }}</span></div>
            </div>
          </article>
          <p v-if="relatedEvents.length === 0" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
        </div>
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
      </div>
      <section class="panel detail-section">
        <div class="panel-head">
          <h2>活动时间线</h2>
          <span class="muted">{{ relatedEventTotal.toLocaleString("ja-JP") }} 场匹配</span>
        </div>
        <div class="timeline-filter" role="group" aria-label="活动类型筛选">
          <button v-for="[value, label] in typeOptions" :key="value" type="button" :class="{ active: relatedEventType === value }" @click="relatedEventType = value">
            {{ label }}
          </button>
        </div>
        <div class="event-list compact">
          <article v-for="event in relatedEvents" :key="event.id" class="event-card clickable-card" tabindex="0" role="button" @click="openEvent(event)" @keydown.enter.prevent="openEvent(event)">
            <div class="date-box">
              <div><span>{{ formatDate(event.date).month }} {{ formatDate(event.date).weekday }}</span><strong>{{ formatDate(event.date).day }}</strong></div>
            </div>
            <div>
              <h3 class="event-title">{{ event.title }}</h3>
              <div class="event-meta"><span>{{ displayVenue(event.venue) }}</span><span v-if="displayArtists(event).length">{{ displayArtists(event).join(" / ") }}</span></div>
            </div>
          </article>
          <p v-if="relatedEvents.length === 0" class="muted">{{ loadingRelated ? "加载中..." : "没有匹配活动。" }}</p>
        </div>
      </section>
      </template>
      <section v-else class="panel">
        <h2>还没有选择会场</h2>
        <button class="primary-button" type="button" @click="go('venues')">去会场列表</button>
      </section>
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
      { id: "notebook", label: "笔记", short: "笔记" },
      { id: "sources", label: "来源", short: "来源" }
    ];

    const page = ref(routePageFromHash());
    const query = ref("");
    const city = ref("all");
    const cityOptions = ref(defaultCityOptions);
    const eventType = ref("all");
    const directoryQuery = ref("");
    const budget = ref(42000);
    const memo = ref("");
    const saveState = ref("");
    const events = ref([]);
    const dayEvents = ref([]);
    const relatedEvents = ref([]);
    const relatedEventTotal = ref(0);
    const relatedEventType = ref("all");
    const loadingRelated = ref(false);
    const querySuggestions = ref([]);
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
    const joinedEvents = ref(new Set([
      "ラブライブ！虹ヶ咲 学园偶像同好会 Fan Meeting",
      "声優ラジオ 公開収録 Vol.18"
    ]));

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

    const plannedCount = computed(() => joinedEvents.value.size);
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
        if (!isDateInCurrentMonth(selectedDate.value)) {
          selectedDate.value = calendarDays.value[0]?.date || `${currentMonth.value}-01`;
        }
        if (payload.selectedDate === selectedDate.value) {
          dayEvents.value = payload.selectedItems || [];
          dayEventTotal.value = payload.selectedTotal || 0;
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
    }

    async function loadEventBySourceId(sourceEventId) {
      if (!sourceEventId) return;
      const payload = await getJson(`/api/event?sourceEventId=${encodeURIComponent(sourceEventId)}`);
      selectedEvent.value = payload.item;
    }

    function currentRelatedQuery() {
      if (page.value === "artist") return selectedArtist.value?.name || "";
      if (page.value === "work") return selectedWork.value?.title || "";
      if (page.value === "venue") return selectedVenue.value?.name || "";
      return "";
    }

    async function loadRelatedEvents(value) {
      if (!value) {
        relatedEvents.value = [];
        relatedEventTotal.value = 0;
        return;
      }
      loadingRelated.value = true;
      const params = new URLSearchParams({
        q: value,
        city: "all",
        type: relatedEventType.value,
        limit: "80"
      });
      const payload = await getJson(`/api/events?${params}`);
      relatedEvents.value = payload.items;
      relatedEventTotal.value = payload.total;
      loadingRelated.value = false;
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

    function applyQuerySuggestion(value) {
      query.value = value;
      hideSuggestions();
    }

    function applyDirectorySuggestion(value) {
      directoryQuery.value = value;
      hideSuggestions();
    }

    function hideSuggestions() {
      showQuerySuggestions.value = false;
      showDirectorySuggestions.value = false;
      querySuggestions.value = [];
      directorySuggestions.value = [];
    }

    function hideSuggestionsSoon() {
      window.setTimeout(hideSuggestions, 120);
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

    function go(target) {
      const nextPage = target || "home";
      page.value = nextPage;
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
      eventReturnPage.value = ["artist", "work", "venue"].includes(page.value) ? page.value : "events";
      if (event.sourceEventId) {
        try {
          const payload = await getJson(`/api/event?sourceEventId=${encodeURIComponent(event.sourceEventId)}`);
          selectedEvent.value = payload.item;
        } catch (error) {
          console.error(error);
        }
      }
      page.value = "event";
      if (window.location.hash !== `#/event/${event.sourceEventId}`) {
        window.location.hash = `/event/${event.sourceEventId}`;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function backFromEventDetail() {
      if (["artist", "work", "venue"].includes(eventReturnPage.value)) {
        page.value = eventReturnPage.value;
        window.location.hash = `/${eventReturnPage.value}`;
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (selectedEvent.value?.date) {
        selectedDate.value = selectedEvent.value.date;
        currentMonth.value = selectedEvent.value.date.slice(0, 7);
        loadCalendar().catch((error) => {
          loading.value = false;
          console.error(error);
        });
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
      window.location.hash = `/artist/${encodeURIComponent(artist.name)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openWork(work) {
      selectedWork.value = work;
      loadRelatedEvents(work.title).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
      page.value = "work";
      window.location.hash = `/work/${encodeURIComponent(work.title)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openVenue(venue) {
      selectedVenue.value = venue;
      loadRelatedEvents(venue.name).catch((error) => {
        loadingRelated.value = false;
        console.error(error);
      });
      page.value = "venue";
      window.location.hash = `/venue/${encodeURIComponent(venue.id)}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
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

    function isJoined(title) {
      return joinedEvents.value.has(title);
    }

    function toggleJoin(title) {
      const next = new Set(joinedEvents.value);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      joinedEvents.value = next;
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
      const nextPage = routePageFromHash();
      const nextParam = routeParamFromHash();
      const nextRouteKey = `${nextPage}/${nextParam}`;
      if (nextRouteKey === currentRouteKey && page.value === nextPage) return;
      currentRouteKey = nextRouteKey;
      page.value = nextPage;
      if (nextPage === "events" && /^\d{4}-\d{2}-\d{2}$/.test(nextParam)) {
        selectedDate.value = nextParam;
        currentMonth.value = nextParam.slice(0, 7);
        loadCalendar().catch((error) => {
          loading.value = false;
          console.error(error);
        });
      } else if (nextPage === "event") {
        loadEventBySourceId(nextParam).catch(console.error);
      } else {
        hydrateDirectoryRoute().catch(console.error);
      }
    }

    window.addEventListener("hashchange", syncRouteFromHash);
    window.setInterval(syncRouteFromHash, 120);

    watch(page, () => {
      directoryQuery.value = "";
      if (page.value === "sources") {
        loadEvents().catch((error) => {
          loading.value = false;
          console.error(error);
        });
      }
    });

    watch([query, city, eventType], () => {
      Promise.all([loadCalendar(), loadYearOverview()]).catch((error) => {
        loading.value = false;
        loadError.value = error?.message || String(error);
        console.error(error);
      });
    });

    let querySuggestionTimer = 0;
    let directorySuggestionTimer = 0;
    let directoryRowsTimer = 0;

    watch(query, (value) => {
      window.clearTimeout(querySuggestionTimer);
      querySuggestionTimer = window.setTimeout(() => {
        loadSuggestions(value, "events", querySuggestions).catch(console.error);
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

    Promise.all([loadMeta(), loadCalendar(), loadYearOverview(), loadLists()]).catch((error) => {
      loading.value = false;
      loadError.value = error?.message || String(error);
      console.error(error);
    });
    hydrateNotebook();

    if (page.value === "event") {
      loadEventBySourceId(routeParamFromHash()).catch(console.error);
    } else if (page.value === "sources") {
      loadEvents().catch(console.error);
    }

    function yearTotal(year) {
      return calendarYears.value.find((row) => row.year === year)?.total || 0;
    }

    return {
      applyDirectorySuggestion,
      applyQuerySuggestion,
      artists: artistRows,
      artistHistoricalTotal,
      budget,
      city,
      cityOptions,
      calendarCells,
      calendarTitle,
      calendarTotal,
      changeMonth,
      currentMonth,
      currentYear,
      dataSources,
      dayEventTotal,
      dayEvents,
      directorySuggestions,
      directoryQuery,
      eventBackLabel,
      eventType,
      events,
      eventDisplayTags,
      followedCount,
      displayVenue,
      displayArtists,
      formatDetailDate,
      formatDate,
      go,
      hideSuggestions,
      hideSuggestionsSoon,
      isConcreteWorkTitle,
      isJoined,
      isNavActive,
      loading,
      loadError,
      loadingRelated,
      meta,
      memo,
      navItems,
      openArtist,
      openArtistByName,
      openEvent,
      openEventVenue,
      openEventWork,
      openVenue,
      openWork,
      page,
      plannedCount,
      query,
      querySuggestions,
      quickSearch,
      relatedEvents,
      relatedEventTotal,
      relatedEventType,
      saveMemo,
      saveState,
      selectDate,
      selectedArtist,
      selectedDate,
      selectedDateLabel,
      selectedEvent,
      selectedVenue,
      selectedWork,
      setYear,
      showDirectorySuggestions,
      showQuerySuggestions,
      toggleJoin,
      typeLabel,
      typeOptions,
      venueHistoricalTotal,
      venues,
      visibleArtists,
      visibleVenues,
      visibleWorks,
      weekdays,
      works,
      yearOptions,
      yearTotal
    };
  }
}).mount("#app");
