import { formatStatsDateRange } from "../utils/time";

export function StatsDateFilters({ dateFrom, dateTo, onDateFromChange, onDateToChange }) {
  return (
    <div className="stats-date-filters">
      <p className="stats-date-label">
        Stats: {formatStatsDateRange(dateFrom, dateTo)}
      </p>
      <div className="stats-date-inputs">
        <label className="stats-date-field">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="filter-select filter-date"
            aria-label="Stats from date"
          />
        </label>
        <label className="stats-date-field">
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="filter-select filter-date"
            aria-label="Stats to date"
          />
        </label>
      </div>
    </div>
  );
}
