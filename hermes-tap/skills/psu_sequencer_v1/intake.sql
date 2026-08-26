-- PSU Sequencer intake: new PSU + inbound leads in Luke's book since the last run.
-- Agent replaces {{SINCE}} with the last intake cursor (ISO timestamp).
-- Book = lead owned by Luke OR matched account owned by one of his 5 AEs.
SELECT
  l.id                              AS lead_id,
  l.first_name, l.last_name, l.email, l.title, l.company,
  l.is_enterprise_user_c           AS ent_user,
  l.product_sign_up_date_c         AS signup_date,
  l.latest_handraiser_date_c       AS handraiser_date,
  l.is_cr_champion_mover_c         AS champion_mover,
  a.id                             AS account_id,
  a.name                           AS account_name,
  a.account_stage_c                AS account_stage,
  u.name                           AS account_owner
FROM hanalytics_production.salesforce.lead l
LEFT JOIN hanalytics_production.salesforce.account a
  ON COALESCE(l.lean_data_reporting_matched_account_c, l.converted_account_id) = a.id
LEFT JOIN hanalytics_production.salesforce.user u ON a.owner_id = u.id
WHERE (l.is_deleted = false OR l.is_deleted IS NULL)
  AND l.email IS NOT NULL
  AND (l.owner_id = '005Nx00000DgtVFIAZ'
       OR a.owner_id IN ('005Nx000009JlMDIA0','005Nx00000AUpgrIAD','005Nx00000FgrP3IAJ',
                         '005Nx000009BFrlIAG','005PE0000036Q69YAE'))
  AND COALESCE(l.product_sign_up_date_c, l.latest_handraiser_date_c) >= '{{SINCE}}'
ORDER BY COALESCE(l.product_sign_up_date_c, l.latest_handraiser_date_c) ASC
LIMIT 500;

-- ============================================================================
-- DAILY BACKFILL SWEEP (runbook step 1S) — catch-all safety net.
-- The forward cursor above keys on COALESCE(signup,handraiser) and only looks
-- forward, so it misses (i) leads attributed into the book AFTER their signup
-- passed the cursor (routing/match lag, reassignment) and (ii) fresh handraisers
-- on older signups. This re-scans the whole book over a trailing window using
-- GREATEST(signup,handraiser); the agent then DEDUPES against the Leads ledger
-- (by lead_id) + 30-day Send Log (by email) and only processes the new ones.
-- Run once/day (gate on State.last_sweep_date). Does NOT advance intake_cursor.
SELECT
  l.id                              AS lead_id,
  l.first_name, l.last_name, l.email, l.title, l.company,
  l.is_enterprise_user_c           AS ent_user,
  l.product_sign_up_date_c         AS signup_date,
  l.latest_handraiser_date_c       AS handraiser_date,
  l.is_cr_champion_mover_c         AS champion_mover,
  a.id                             AS account_id,
  a.name                           AS account_name,
  a.account_stage_c                AS account_stage,
  u.name                           AS account_owner
FROM hanalytics_production.salesforce.lead l
LEFT JOIN hanalytics_production.salesforce.account a
  ON COALESCE(l.lean_data_reporting_matched_account_c, l.converted_account_id) = a.id
LEFT JOIN hanalytics_production.salesforce.user u ON a.owner_id = u.id
WHERE (l.is_deleted = false OR l.is_deleted IS NULL)
  AND l.email IS NOT NULL
  AND (l.owner_id = '005Nx00000DgtVFIAZ'
       OR a.owner_id IN ('005Nx000009JlMDIA0','005Nx00000AUpgrIAD','005Nx00000FgrP3IAJ',
                         '005Nx000009BFrlIAG','005PE0000036Q69YAE'))
  AND GREATEST(COALESCE(l.product_sign_up_date_c, l.latest_handraiser_date_c),
               COALESCE(l.latest_handraiser_date_c, l.product_sign_up_date_c))
      >= date_add(current_date(), -30)
ORDER BY GREATEST(COALESCE(l.product_sign_up_date_c, l.latest_handraiser_date_c),
                  COALESCE(l.latest_handraiser_date_c, l.product_sign_up_date_c)) DESC
LIMIT 5000;  -- DESC + headroom: 30d book ~2.8k; newest-first so a cap never hides un-processed leads

-- Account teams query (DORMANT — custom85 cut 2026-06-17; kept for revival only).
-- SELECT function_lob, SUM(total_seats) seats
-- FROM hanalytics_production.ds_go_to_market.mart_customer_use_case
-- WHERE account_id = '{{ACCOUNT_ID}}'
--   AND function_lob NOT IN ('Other','Other / Unknown','Company-wide','Not available (legacy primary use case)')
--   AND function_lob IS NOT NULL
-- GROUP BY 1 ORDER BY seats DESC LIMIT 3;
