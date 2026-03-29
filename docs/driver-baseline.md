# Driver Baseline (Code-Backed)

Date reviewed: 2026-03-25.

## Covered areas
- Driver Home
- Driver Profile
- Driver Incidents

---

## 1) Driver Home

### Confirmed from code
- Uses the shared home/app shell, with driver data constrained by active `DriverDispatch` visibility (assignment-based visibility).
- Today/Upcoming dispatch lists include only assigned dispatches.
- Visible truck badges are based on assigned truck(s) per dispatch for that driver.
- Action items come from notification stream filtered by driver visibility rules (assignment-based, not company-wide).
- See `docs/portal-dispatch-drawer-behavior-baseline.md` for assignment-based dispatch visibility details.

### Present in personal baseline
- Driver home aligns with owner-style layout but with restricted scope.
- Assignment-based visibility constraints.

### Missing from personal baseline
- None currently confirmed.

### Conflicts with personal baseline
- None currently confirmed.

### Needs manual verification
- Multi-assignment edge-case presentation in compact home cards.

---

## 2) Driver Profile

### Confirmed from code
- Driver name and phone are read-only.
- Driver can toggle only their own SMS consent (`driver_sms_opt_in`).
- Effective SMS enabled requires `owner_sms_enabled` + `driver_sms_opt_in` + valid phone.
- Saving opt-in synchronizes linked driver access-code SMS fields.
- SMS confirmation text messages are attempted on opt-in/opt-out.
- See `docs/notifications-behavior-baseline.md` for notification/SMS delivery-side eligibility details.

### Present in personal baseline
- View-only identity fields.
- Driver-controlled SMS opt-in behavior.

### Missing from personal baseline
- None currently confirmed.

### Conflicts with personal baseline
- None currently confirmed.

### Needs manual verification
- Delivery reliability of profile confirmation SMS in production integration.

---

## 3) Driver Incidents

### Confirmed from code
- Driver does **not** see global "Create Incident" button on Incidents page.
- Driver can still create via dispatch drawer "Report Incident" deep-link (`Incidents?create=1&fromDispatch=1...`).
- Prefill includes dispatch/company and prefilled truck only when uniquely resolvable.
- Driver can view incidents they created and incidents tied to dispatches they are assigned to.
- Driver can add timeline updates/notes on visible incidents.
- See `docs/admin-dispatches-behavior-baseline.md` and `docs/portal-dispatch-drawer-behavior-baseline.md` for dispatch-linked incident entry context.

### Present in personal baseline
- Driver incident creation from dispatch drawer.
- Driver visibility constraints on incidents.
- Incidents-page create button hidden for drivers.
- Truck prefill behavior is conditional.

### Missing from personal baseline
- None currently confirmed.

### Conflicts with personal baseline
- None currently confirmed.

### Needs manual verification
- Whether product requirement expects hard-enforced single-truck prefill for all driver entry paths.
