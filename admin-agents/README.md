# Admin Agents

This folder is for admin-side automation on your local e-commerce admin panel.

## Target

- Admin URL: `http://localhost:3000/admin/`

## Planned admin-agent functions

1. **openAdminPanel**
   - Navigate to `http://localhost:3000/admin/`.

2. **checkCustomers**
   - Open the customers section.
   - Validate customer list/load status.

3. **goToStorefrontDataOps**
   - Go to storefront area.
   - Look for **Export CSV**.
   - Export customer/order/product CSV as needed.

4. **importCsvFiles**
   - Import CSV files directly through admin import flows.
   - Track import success/failure results.

5. **activateDataConsole**
   - Open/activate the data console in admin.
   - Capture output/results from the console.

6. **executeDataConsoleActions**
   - Parse the recommended changes returned by data console.
   - Execute those changes in admin workflows.
   - Re-check the result/status after applying updates.

## Suggested run order

1. `openAdminPanel`
2. `checkCustomers`
3. `goToStorefrontDataOps`
4. `importCsvFiles`
5. `activateDataConsole`
6. `executeDataConsoleActions`

## Notes

- Use this only for your local/demo environment.
- Keep an audit log of each admin action (timestamp + action + status).
- Confirm destructive actions before applying bulk changes.


## Admin analytics capture script

- `analytics-agent.js` opens `http://localhost:3000/admin/`, reads signed-in customer analytics metrics, and saves `admin-agents/analytics-capture.json`.
- It also compares admin-side metrics with `customer-agents/data/behavior-report.json` to infer the active customer behavior spectrum.

Run:

```bash
node admin-agents/analytics-agent.js
```
