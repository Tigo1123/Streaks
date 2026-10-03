import React from "react";
import { t } from "../../i18n/index.js";

export function DistributionCard({ distribution, language }) {
  const {
    completed,
    missed,
    due,
    completedPercent,
    missedPercent
  } = distribution;
  const description = t("distributionDescription", {
    due,
    completed,
    completedPercent,
    missed,
    missedPercent
  }, language);

  return (
    <section className="distribution-card" aria-labelledby="distributionTitle">
      <h2 id="distributionTitle" className="distribution-title">
        {t("distributionTitle", {}, language)}
      </h2>
      <div
        className="distribution-bar"
        role="img"
        aria-label={description}
      >
        <span
          className="distribution-bar-completed"
          style={{ width: `${completedPercent}%` }}
        />
        <span
          className="distribution-bar-missed"
          style={{ width: `${missedPercent}%` }}
        />
      </div>
      <ul className="distribution-legend">
        <li>
          <span className="distribution-label">
            <span className="distribution-dot completed" aria-hidden="true" />
            {t("completed", {}, language)}
          </span>
          <span className="distribution-value">
            {completed} · {t("percent", { percent: completedPercent }, language)}
          </span>
        </li>
        <li>
          <span className="distribution-label">
            <span className="distribution-dot missed" aria-hidden="true" />
            {t("missed", {}, language)}
          </span>
          <span className="distribution-value">
            {missed} · {t("percent", { percent: missedPercent }, language)}
          </span>
        </li>
      </ul>
    </section>
  );
}
