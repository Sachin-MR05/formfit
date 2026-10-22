# FormFit API (v0.4)

Base path `/api`, JSON in and out (snake_case), `Authorization: Bearer <token>` on everything except health, sign-up and
sign-in. Errors: `{"error": {"code": "...", "message": "...", "details": {...}}}`. Interactive docs when the server runs:
`/api/docs` (route list; the shapes are described here).

| Method and path | Purpose |
|---|---|
| `GET /health` | liveness |
| `POST /auth/signup` `{email, password (8-128), display_name?, accept_terms: true}` | 201 `{user, access_token, token_type, expires_in}`; 409 `email_taken` |
| `POST /auth/login` `{email, password}` | 200 same shape; 401 `invalid_credentials`; 429 `rate_limited` (+ `Retry-After`) |
| `GET /auth/me` | `{user}` |
| `POST /sync/push` `{profiles[], sessions[], reps[]}` | idempotent upload; result lists per type: `accepted`, `stale`, `rejected[{id, reason}]` |
| `GET /sync/pull?profiles_cursor=&sessions_cursor=&reps_cursor=&limit=` | changes after each cursor; returns `{server_time, profiles[], sessions[], reps[], cursors{}, has_more{}}` |
| `GET /sessions?limit=&offset=` | history with `rep_count`, `avg_score`, `good_count` |
| `GET /sessions/{id}` | one session with its reps |
| `GET /profile` | latest body profile |
| `PUT /reps/{id}/label` `{label: "good" \| "faulty" \| null}` | label a rep |
| `GET /export` / `GET /export.csv?person_id=` | all my data (JSON) / labelled reps in the training CSV format |
| `DELETE /me` `{password}` | delete the account and all data |

## Records (push and pull)
```jsonc
// profile
{"id","kind":"measured|manual|average","femur_torso","shank_femur","leg_torso","up_sign":-1|1,"side":"left|right",
 "samples","source","hip_image_y0","thigh2d","created_at","updated_at"}
// session   (a deletion is just {"id","updated_at","deleted":true})
{"id","started_at","ended_at":null,"source":"live|upload","file_name":null,"pose_model":"lite|full|heavy","model_version",
 "profile":{"femur_torso","shank_femur","leg_torso","up_sign"},"updated_at"}
// rep
{"id","session_id","index","created_at","t_seconds","features":{"knee","hip","torso","shank","phi"},
 "profile":{"femur_torso","shank_femur","leg_torso"},"score":0-100,"personalized":0-1,"generic":0-1,"rule_ok",
 "rule_reasons":[],"codes":[],"down_s","up_s","model_version","label":null|"good"|"faulty","updated_at"}
```
All timestamps are epoch milliseconds. `updated_at` is the **client's** version time (last writer wins). Pulled records
also carry `server_updated_at`, which the cursors are based on. Push limits: 20 profiles, 100 sessions, 500 reps per request.

Rejection reasons: `id_conflict` (the id belongs to someone else, or a rep tries to change session), `unknown_session`,
`session_deleted`.
