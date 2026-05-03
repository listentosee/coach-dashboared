# Game Platform Report Card - Feature Specification

## Overview

A comprehensive performance dashboard for coaches to view detailed competitor activity, strengths, weaknesses, and progress in the MetaCTF Game Platform.

## User Stories

**As a coach, I want to:**
1. See a competitor's overall performance summary at a glance
2. Understand which cybersecurity domains they excel in vs struggle with
3. View detailed challenge completion history (ODL + Flash CTF)
4. Track activity patterns over time
5. Compare competitor performance to their peers
6. Identify areas for focused training
7. Export/print the report for meetings or records

## Data Sources

### From `game_platform_stats`
- Total challenges completed
- Total points earned
- Last activity timestamp
- Sync status

### From `game_platform_challenge_solves`
- Individual challenge records (ODL + Flash CTF)
- Challenge categories/domains
- Points per challenge
- Solve timestamps
- NIST work roles

### From `game_platform_flash_ctf_events`
- Flash CTF participation
- Event rankings
- Points earned per event
- Challenges solved per event

### From `competitors` + `teams`
- Competitor name/profile
- Team affiliation
- Division
- Coach information

## Report Card Sections

### 1. Header / Summary Card
**Visual:** Gradient card with key metrics

- Competitor name + photo/avatar
- Team name + division
- Total points (large, prominent)
- Total challenges completed
- Last activity (relative time)
- Sync status indicator

### 2. Performance Overview
**Visual:** Grid of stat cards

- **ODL Challenges:** X completed, Y points
- **Flash CTF Events:** X participated, Y avg rank
- **Active Domains:** X out of 9 categories attempted
- **Recent Activity:** Last 7/30 days stats

### 3. Domain Strength Analysis
**Visual:** Horizontal bar chart + category cards

**Strong Domains (Top 3):**
- Category name
- Challenges completed
- Points earned
- Success indicators (badges/icons)

**Developing Domains (Middle):**
- Categories with some activity but lower performance

**Growth Areas (Bottom 3):**
- Categories with few/no attempts
- Recommended focus areas

**Metrics per domain:**
- Number of challenges completed
- Total points earned
- Average difficulty (easy/medium/hard)
- Percentage of available challenges completed (if known)

### 4. Challenge Activity Timeline
**Visual:** Timeline/calendar heatmap + line chart

- **Calendar Heatmap:** Activity by day (last 90 days)
  - Color intensity = points earned that day
  - Tooltip shows challenges completed

- **Line Chart:** Points accumulated over time
  - Separate lines for ODL vs Flash CTF
  - Annotations for major events

### 5. Recent Challenges (Detailed Table)
**Visual:** Sortable, filterable data table

**Columns:**
- Date solved
- Challenge name
- Category/domain
- Source (ODL / Flash CTF event name)
- Points
- Difficulty indicator
- NIST work role tags

**Features:**
- Sort by any column
- Filter by category
- Filter by source (ODL/Flash CTF)
- Filter by date range
- Search by challenge name
- Pagination (20 per page)

### 6. Flash CTF Participation
**Visual:** Event cards + trend chart

**For each Flash CTF event:**
- Event name + date
- Rank achieved
- Challenges solved
- Points earned
- Time spent (if available)
- Best category in that event

**Trend chart:**
- Rank progression across events
- Points earned per event
- Participation frequency

### 7. NIST Work Role Coverage
**Visual:** Tag cloud or grid

- Show which NIST work roles the competitor has covered
- Highlight most practiced roles
- Identify gaps in coverage
- Link to NICE framework documentation

### 8. Peer Comparison (Optional)
**Visual:** Comparison chart

- Compare to team average
- Compare to division average
- Percentile ranking
- Areas where competitor excels vs peers

### 9. Insights & Recommendations
**Visual:** Cards with actionable items

**Auto-generated insights:**
- "Strong in forensics! Consider advanced challenges."
- "No activity in cryptography - recommend starting with easier challenges."
- "Active in last 7 days - great momentum!"
- "Rank improved by 5 positions in last Flash CTF!"
- "On track to complete 50 challenges by end of month."

### 10. Export Options
**Actions:**
- Print report (print-friendly CSS)
- Export to PDF
- Share link (if permissions allow)
- Download CSV of challenge data

## UI/UX Design

### Layout
- **Desktop:** 2-column layout with sidebar for filters/navigation
- **Tablet:** Single column, collapsible sections
- **Mobile:** Stacked cards, simplified charts

### Visual Style
- Match existing dashboard design system
- Use color coding for categories (consistent across app)
- Responsive charts using Recharts
- Loading states with skeletons
- Empty states with helpful messages

### Navigation
- **Access from:**
  - Competitor detail page
  - Dashboard competitor table (action menu)
  - Team detail page (link per competitor)

- **Breadcrumbs:**
  - Dashboard > Teams > [Team Name] > [Competitor Name] > Report Card

### Interactions
- Click domain bar → filter challenges to that domain
- Click event card → see detailed event challenges
- Hover chart points → see detailed tooltips
- Click challenge → expand for full details (modal or accordion)

## Technical Implementation

### API Route
```typescript
// app/api/game-platform/report-card/[competitorId]/route.ts
GET /api/game-platform/report-card/[competitorId]

Response:
{
  competitor: { id, name, team, division, ... },
  summary: {
    totalPoints: number,
    totalChallenges: number,
    odlChallenges: number,
    flashCtfEvents: number,
    lastActivity: ISO string,
    daysActive: number
  },
  domains: [
    {
      category: string,
      challengesCompleted: number,
      totalPoints: number,
      avgDifficulty: 'easy' | 'medium' | 'hard',
      rank: number, // 1-9 ranking
      strength: 'strong' | 'developing' | 'growth_area'
    }
  ],
  recentChallenges: [
    {
      id: string,
      solvedAt: ISO string,
      title: string,
      category: string,
      source: string, // 'odl' | 'Flash CTF Name'
      points: number,
      nistRoles: string[]
    }
  ],
  flashCtfEvents: [
    {
      eventId: string,
      name: string,
      date: ISO string,
      rank: number,
      challengesSolved: number,
      pointsEarned: number,
      topCategory: string
    }
  ],
  activityTimeline: [
    { date: string, points: number, challenges: number }
  ],
  insights: [
    { type: string, message: string, priority: 'high' | 'medium' | 'low' }
  ],
  nistCoverage: {
    rolesCovered: string[],
    totalRoles: number,
    coveragePercent: number
  }
}
```

### Database Queries

```sql
-- Summary stats
SELECT
  COUNT(*) as total_challenges,
  SUM(challenge_points) as total_points,
  COUNT(DISTINCT DATE(solved_at)) as days_active,
  MAX(solved_at) as last_activity
FROM game_platform_challenge_solves
WHERE syned_user_id = $1;

-- Domain breakdown
SELECT
  challenge_category,
  COUNT(*) as challenges_completed,
  SUM(challenge_points) as total_points,
  AVG(challenge_points) as avg_points,
  MIN(challenge_points) as min_points,
  MAX(challenge_points) as max_points
FROM game_platform_challenge_solves
WHERE syned_user_id = $1
GROUP BY challenge_category
ORDER BY total_points DESC;

-- Recent challenges
SELECT
  id,
  solved_at,
  challenge_title,
  challenge_category,
  source,
  challenge_points,
  raw_payload->'nist_nice_work_roles' as nist_roles
FROM game_platform_challenge_solves
WHERE syned_user_id = $1
ORDER BY solved_at DESC
LIMIT 50;

-- Flash CTF events
SELECT
  event_id,
  flash_ctf_name,
  started_at,
  rank,
  challenges_solved,
  points_earned,
  raw_payload
FROM game_platform_flash_ctf_events
WHERE syned_user_id = $1
ORDER BY started_at DESC;

-- Activity timeline (daily)
SELECT
  DATE(solved_at) as date,
  SUM(challenge_points) as points,
  COUNT(*) as challenges
FROM game_platform_challenge_solves
WHERE syned_user_id = $1
  AND solved_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(solved_at)
ORDER BY date;
```

### React Components

```
app/dashboard/game-platform/report-card/[competitorId]/
  page.tsx                          // Main page component

components/game-platform/report-card/
  report-card-header.tsx            // Summary card
  performance-overview.tsx          // Stat cards
  domain-strength-chart.tsx         // Bar chart
  domain-category-cards.tsx         // Top/bottom domains
  activity-timeline.tsx             // Calendar heatmap
  activity-chart.tsx                // Line chart
  challenges-table.tsx              // Detailed table
  flash-ctf-events.tsx              // Event cards
  nist-coverage.tsx                 // Work role tags
  insights-panel.tsx                // Auto-generated insights
  export-menu.tsx                   // Export options
```

## Insights Generation Logic

### Strength Identification
```typescript
function identifyStrengths(domains: DomainStats[]) {
  // Top 3 by points
  const strong = domains
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 3);

  return strong.map(d => ({
    type: 'strength',
    message: `Strong in ${d.category}! Completed ${d.challenges} challenges.`,
    priority: 'high'
  }));
}
```

### Growth Area Identification
```typescript
function identifyGrowthAreas(domains: DomainStats[], allCategories: string[]) {
  // Categories with 0-2 challenges
  const weak = domains.filter(d => d.challenges < 3);
  const missing = allCategories.filter(c => !domains.find(d => d.category === c));

  return [...weak, ...missing.map(c => ({ category: c, challenges: 0 }))]
    .map(d => ({
      type: 'growth_area',
      message: d.challenges === 0
        ? `No activity in ${d.category} yet. Great opportunity to explore!`
        : `Only ${d.challenges} challenges in ${d.category}. Consider more practice.`,
      priority: 'medium'
    }));
}
```

### Activity Pattern Detection
```typescript
function detectActivityPatterns(timeline: ActivityData[]) {
  const last7Days = timeline.slice(-7);
  const last30Days = timeline.slice(-30);

  const insights = [];

  // Recent activity
  if (last7Days.some(d => d.challenges > 0)) {
    insights.push({
      type: 'activity',
      message: 'Active in the last 7 days - keep up the momentum!',
      priority: 'high'
    });
  }

  // Streak detection
  let currentStreak = 0;
  for (const day of timeline.reverse()) {
    if (day.challenges > 0) currentStreak++;
    else break;
  }

  if (currentStreak >= 3) {
    insights.push({
      type: 'streak',
      message: `On a ${currentStreak}-day streak! 🔥`,
      priority: 'high'
    });
  }

  return insights;
}
```

### Flash CTF Progress
```typescript
function analyzeFlashCtfProgress(events: FlashCtfEvent[]) {
  if (events.length < 2) return [];

  const sorted = events.sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  const insights = [];

  // Rank improvement
  if (latest.rank < previous.rank) {
    insights.push({
      type: 'flash_ctf',
      message: `Rank improved from ${previous.rank} to ${latest.rank} in latest Flash CTF!`,
      priority: 'high'
    });
  }

  // Participation consistency
  if (events.length >= 3) {
    insights.push({
      type: 'flash_ctf',
      message: `Participated in ${events.length} Flash CTF events. Great consistency!`,
      priority: 'medium'
    });
  }

  return insights;
}
```

## Permissions & Access Control

### Who Can View
- **Coaches:** Can view report cards for their own competitors
- **Admins:** Can view all report cards
- **Competitors:** Can view their own report card (future feature)

### Authorization Check
```typescript
async function canViewReportCard(userId: string, competitorId: string) {
  const user = await getUser(userId);

  if (user.role === 'admin') return true;

  if (user.role === 'coach') {
    const competitor = await getCompetitor(competitorId);
    return competitor.coach_id === userId;
  }

  // Future: if (user.role === 'competitor') return competitorId === userId;

  return false;
}
```

## Performance Considerations

### Caching Strategy
- Cache report data for 5 minutes per competitor
- Invalidate cache on sync job completion
- Use Redis or in-memory cache

### Query Optimization
- Add database indexes on frequently queried columns
- Denormalize summary stats if needed
- Paginate challenge table (load on demand)

### Loading Strategy
- Show skeleton loaders for each section
- Load sections progressively (summary first, then details)
- Lazy load charts when scrolling

## Future Enhancements

### Phase 2
- [ ] Goal setting and progress tracking
- [ ] Competitor self-service view
- [ ] Coach annotations/notes on report
- [ ] Automated email reports (weekly/monthly)

### Phase 3
- [ ] AI-powered recommendations
- [ ] Challenge suggestions based on weak areas
- [ ] Predicted trajectory/milestone forecasting
- [ ] Learning path visualization

## Success Metrics

- **Usage:** >70% of coaches view at least one report per week
- **Engagement:** Average time on page >2 minutes
- **Utility:** >4.0/5.0 coach satisfaction rating
- **Performance:** Page load time <2 seconds (p95)