from app.repo import Store
from tests.helpers import NOW, Clock, call, make_dispatcher, profile, rep, session, signup


def push(d, token, **payload):
    status, body = call(d, "POST", "/sync/push", payload, token=token)
    assert status == 200, body
    return body


def pull(d, token, **query):
    status, body = call(d, "GET", "/sync/pull", token=token, query=query)
    assert status == 200, body
    return body


# ------------------------------------------------------------------ push basics
def test_push_creates_everything_and_history_shows_it():
    d = make_dispatcher()
    t = signup(d)
    res = push(d, t, profiles=[profile()], sessions=[session()], reps=[rep(index=1, score=90), rep("rep-00002", index=2, score=60)])
    assert res["profiles"]["accepted"] == ["prof-0001"] and res["sessions"]["accepted"] == ["sess-0001"]
    assert res["reps"]["accepted"] == ["rep-00001", "rep-00002"] and res["reps"]["rejected"] == []
    listing = call(d, "GET", "/sessions", token=t)[1]["sessions"]
    assert len(listing) == 1 and listing[0]["rep_count"] == 2 and listing[0]["avg_score"] == 75.0 and listing[0]["good_count"] == 2
    detail = call(d, "GET", "/sessions/sess-0001", token=t)[1]
    assert [r["index"] for r in detail["reps"]] == [1, 2] and detail["reps"][0]["features"]["knee"] == 60.5
    assert call(d, "GET", "/profile", token=t)[1]["profile"]["femur_torso"] == 0.94


def test_numbers_survive_the_round_trip_exactly():
    d = make_dispatcher()
    t = signup(d)
    r = rep(features={"knee": 61.123456789, "hip": 50.5, "torso": 35.987654321, "shank": 38.1, "phi": -4.999999})
    push(d, t, sessions=[session()], reps=[r])
    got = call(d, "GET", "/sessions/sess-0001", token=t)[1]["reps"][0]
    assert got["features"] == r["features"] and got["profile"] == r["profile"] and got["codes"] == ["torso_forward"] and got["rule_ok"] is True


def test_retrying_a_push_is_idempotent():
    d = make_dispatcher()
    t = signup(d)
    payload = dict(sessions=[session()], reps=[rep()])
    push(d, t, **payload)
    again = push(d, t, **payload)
    assert again["sessions"]["accepted"] == ["sess-0001"] and again["reps"]["accepted"] == ["rep-00001"]  # same version is accepted, nothing duplicated
    assert call(d, "GET", "/sessions", token=t)[1]["sessions"][0]["rep_count"] == 1
    assert len(call(d, "GET", "/export", token=t)[1]["reps"]) == 1


def test_a_rep_may_arrive_with_or_before_its_session_in_the_same_push_but_not_without_one():
    d = make_dispatcher()
    t = signup(d)
    res = push(d, t, reps=[rep()])
    assert res["reps"]["rejected"] == [{"id": "rep-00001", "reason": "unknown_session"}]
    res = push(d, t, sessions=[session()], reps=[rep()])
    assert res["reps"]["accepted"] == ["rep-00001"]


# ------------------------------------------------------------------ last writer wins
def test_older_versions_never_overwrite_newer_ones():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session(updated=NOW + 100, ended_at=NOW + 50)], reps=[rep(updated=NOW + 100, label="good")])
    res = push(d, t, sessions=[session(updated=NOW + 10, ended_at=None)], reps=[rep(updated=NOW + 10, label="faulty")])
    assert res["sessions"]["stale"] == ["sess-0001"] and res["reps"]["stale"] == ["rep-00001"]
    got = call(d, "GET", "/sessions/sess-0001", token=t)[1]
    assert got["session"]["ended_at"] == NOW + 50 and got["reps"][0]["label"] == "good"


def test_newer_versions_win():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session()], reps=[rep()])
    res = push(d, t, sessions=[session(updated=NOW + 500, ended_at=NOW + 400)], reps=[rep(updated=NOW + 500, label="faulty")])
    assert res["sessions"]["accepted"] == ["sess-0001"] and res["reps"]["accepted"] == ["rep-00001"]
    got = call(d, "GET", "/sessions/sess-0001", token=t)[1]
    assert got["session"]["ended_at"] == NOW + 400 and got["reps"][0]["label"] == "faulty"


# ------------------------------------------------------------------ deletion (tombstones)
def test_deleting_a_session_removes_reps_scrubs_the_name_and_blocks_resurrection():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session(file_name="private_video.mp4", source="upload")], reps=[rep(), rep("rep-00002", index=2)])
    res = push(d, t, sessions=[{"id": "sess-0001", "updated_at": NOW + 10, "deleted": True}])
    assert res["sessions"]["accepted"] == ["sess-0001"]
    assert call(d, "GET", "/sessions", token=t)[1]["sessions"] == []
    assert call(d, "GET", "/sessions/sess-0001", token=t)[0] == 404
    assert call(d, "GET", "/export", token=t)[1]["reps"] == []
    # the other device learns about the deletion when it pulls (and the file name is gone)
    stub = [s for s in pull(d, t)["sessions"] if s["id"] == "sess-0001"][0]
    assert stub == {"id": "sess-0001", "updated_at": NOW + 10, "server_updated_at": stub["server_updated_at"], "deleted": True}
    # an offline device that edits the session later cannot bring it back, and cannot add reps to it
    res = push(d, t, sessions=[session(updated=NOW + 999)], reps=[rep("rep-00009", index=9, updated=NOW + 999)])
    assert res["sessions"]["rejected"] == [{"id": "sess-0001", "reason": "session_deleted"}]
    assert res["reps"]["rejected"] == [{"id": "rep-00009", "reason": "session_deleted"}]
    assert call(d, "GET", "/sessions", token=t)[1]["sessions"] == []


def test_deleting_something_that_does_not_exist_is_a_harmless_success():
    d = make_dispatcher()
    t = signup(d)
    assert push(d, t, sessions=[{"id": "sess-9999", "updated_at": NOW, "deleted": True}])["sessions"]["accepted"] == ["sess-9999"]


# ------------------------------------------------------------------ users cannot touch each other's data
def test_users_are_isolated():
    d = make_dispatcher()
    a, b = signup(d, "a@example.com"), signup(d, "b@example.com")
    push(d, a, profiles=[profile()], sessions=[session()], reps=[rep()])

    assert call(d, "GET", "/sessions", token=b)[1]["sessions"] == []
    assert call(d, "GET", "/sessions/sess-0001", token=b)[0] == 404
    assert call(d, "GET", "/profile", token=b)[1]["profile"] is None
    assert call(d, "GET", "/export", token=b)[1]["reps"] == []
    p = pull(d, b)
    assert p["sessions"] == [] and p["reps"] == [] and p["profiles"] == []

    # b guesses a's ids: every write is refused and a's data is untouched
    res = push(d, b, profiles=[profile(updated=NOW + 99, femur_torso=1.0)], sessions=[session(updated=NOW + 99, source="upload")], reps=[rep(updated=NOW + 99, score=1)])
    assert res["profiles"]["rejected"][0]["reason"] == "id_conflict"
    assert res["sessions"]["rejected"][0]["reason"] == "id_conflict"
    assert res["reps"]["rejected"][0]["reason"] == "unknown_session"
    res = push(d, b, sessions=[{"id": "sess-0001", "updated_at": NOW + 99, "deleted": True}])
    assert res["sessions"]["rejected"][0]["reason"] == "id_conflict"
    assert call(d, "PUT", "/reps/rep-00001/label", {"label": "faulty"}, token=b)[0] == 404

    mine = call(d, "GET", "/sessions/sess-0001", token=a)[1]
    assert mine["session"]["source"] == "live" and mine["reps"][0]["score"] == 80 and mine["reps"][0]["label"] is None


def test_a_rep_cannot_be_moved_into_another_users_session():
    d = make_dispatcher()
    a, b = signup(d, "a@example.com"), signup(d, "b@example.com")
    push(d, a, sessions=[session()], reps=[rep()])
    push(d, b, sessions=[session("sess-0002")])
    res = push(d, b, reps=[rep(sid="sess-0002", updated=NOW + 5)])  # same rep id, b's own session
    assert res["reps"]["rejected"] == [{"id": "rep-00001", "reason": "id_conflict"}]


def test_a_rep_cannot_be_moved_between_my_own_sessions():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session(), session("sess-0002")], reps=[rep()])
    res = push(d, t, reps=[rep(sid="sess-0002", updated=NOW + 5)])
    assert res["reps"]["rejected"][0]["reason"] == "id_conflict"


# ------------------------------------------------------------------ pull
def test_pull_returns_changes_with_cursors_and_pagination():
    clock = Clock()
    d = make_dispatcher(clock)
    t = signup(d)
    push(d, t, sessions=[session()])
    for i in range(1, 6):
        clock.advance(10)
        push(d, t, reps=[rep(f"rep-{i:05d}", index=i)])
    first = pull(d, t, limit="2")
    assert [r["index"] for r in first["reps"]] == [1, 2] and first["has_more"]["reps"] is True and first["has_more"]["sessions"] is False
    second = pull(d, t, limit="2", reps_cursor=first["cursors"]["reps"])
    assert [r["index"] for r in second["reps"]] == [3, 4] and second["has_more"]["reps"] is True
    third = pull(d, t, limit="2", reps_cursor=second["cursors"]["reps"])
    assert [r["index"] for r in third["reps"]] == [5] and third["has_more"]["reps"] is False
    nothing = pull(d, t, reps_cursor=third["cursors"]["reps"], sessions_cursor=first["cursors"]["sessions"])
    assert nothing["reps"] == [] and nothing["sessions"] == []
    assert nothing["cursors"]["reps"] == third["cursors"]["reps"]  # an empty page keeps the cursor


def test_pagination_is_stable_when_many_rows_share_a_timestamp():
    d = make_dispatcher()  # frozen clock: every row gets the same server timestamp
    t = signup(d)
    push(d, t, sessions=[session()], reps=[rep(f"rep-{i:05d}", index=i) for i in range(1, 8)])
    seen: list[int] = []
    cursor = None
    for _ in range(10):
        page = pull(d, t, limit="3", **({"reps_cursor": cursor} if cursor else {}))
        seen += [r["index"] for r in page["reps"]]
        cursor = page["cursors"]["reps"]
        if not page["has_more"]["reps"]:
            break
    assert seen == [1, 2, 3, 4, 5, 6, 7]


def test_a_second_device_sees_updates_after_its_cursor():
    clock = Clock()
    d = make_dispatcher(clock)
    t = signup(d)
    push(d, t, sessions=[session()], reps=[rep()])
    first = pull(d, t)
    clock.advance(1000)
    call(d, "PUT", "/reps/rep-00001/label", {"label": "faulty"}, token=t)
    changed = pull(d, t, reps_cursor=first["cursors"]["reps"])
    assert [r["label"] for r in changed["reps"]] == ["faulty"]


def test_bad_cursors_and_limits_are_rejected():
    d = make_dispatcher()
    t = signup(d)
    assert call(d, "GET", "/sync/pull", token=t, query={"reps_cursor": "oops"})[0] == 422
    assert call(d, "GET", "/sync/pull", token=t, query={"limit": "0"})[0] == 422


# ------------------------------------------------------------------ labels, export, history paging
def test_labels_and_csv_export_match_the_training_format():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session()], reps=[rep(index=1), rep("rep-00002", index=2), rep("rep-00003", index=3)])
    assert call(d, "PUT", "/reps/rep-00001/label", {"label": "good"}, token=t)[1] == {"id": "rep-00001", "label": "good"}
    assert call(d, "PUT", "/reps/rep-00002/label", {"label": "faulty"}, token=t)[0] == 200
    assert call(d, "PUT", "/reps/rep-00003/label", {"label": "maybe"}, token=t)[0] == 422
    assert call(d, "PUT", "/reps/rep-xxxxxxx/label", {"label": "good"}, token=t)[0] == 404
    status, csv_text = call(d, "GET", "/export.csv", token=t, query={"person_id": "ann"})
    lines = csv_text.strip().split("\n")
    assert status == 200 and lines[0] == "person_id,rep_id,knee,hip,torso,shank,phi,femur_torso,shank_femur,leg_torso,label"
    assert lines[1] == "ann,1,60.5000,50.2500,35.0000,38.0000,-5.0000,0.9400,0.9800,1.8600,1" and lines[2].endswith(",0") and len(lines) == 3
    assert call(d, "GET", "/export.csv", token=t, query={"person_id": "a,b"})[0] == 422


def test_json_export_contains_my_data_but_no_secrets():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, profiles=[profile()], sessions=[session()], reps=[rep()])
    exp = call(d, "GET", "/export", token=t)[1]
    assert exp["user"]["email"] == "a@example.com" and len(exp["profiles"]) == len(exp["sessions"]) == len(exp["reps"]) == 1
    assert "password" not in str(exp)


def test_history_paging():
    d = make_dispatcher()
    t = signup(d)
    push(d, t, sessions=[session(f"sess-{i:04d}", started_at=NOW + i) for i in range(1, 6)])
    names = lambda **q: [s["id"] for s in call(d, "GET", "/sessions", token=t, query=q)[1]["sessions"]]
    assert names(limit="2") == ["sess-0005", "sess-0004"] and names(limit="2", offset="2") == ["sess-0003", "sess-0002"]
    assert call(d, "GET", "/sessions", token=t, query={"offset": "-1"})[0] == 422


# ------------------------------------------------------------------ account deletion
def test_deleting_the_account_removes_everything_and_needs_the_password():
    d = make_dispatcher()
    t = signup(d, "a@example.com")
    other = signup(d, "b@example.com")
    push(d, t, profiles=[profile()], sessions=[session()], reps=[rep()])
    push(d, other, sessions=[session("sess-0002")], reps=[rep("rep-00002", "sess-0002")])
    status, body = call(d, "DELETE", "/me", {"password": "wrong-password"}, token=t)
    assert status == 403 and body["error"]["code"] == "wrong_password"
    assert call(d, "DELETE", "/me", {}, token=t)[0] == 422
    status, body = call(d, "DELETE", "/me", {"password": "correct horse"}, token=t)
    assert status == 200 and body["removed"] == {"body_profiles": 1, "sessions": 1, "reps": 1}
    assert call(d, "GET", "/auth/me", token=t)[1]["error"]["code"] == "invalid_token"  # the old token is useless now
    assert call(d, "POST", "/auth/login", {"email": "a@example.com", "password": "correct horse"})[0] == 401
    assert len(call(d, "GET", "/export", token=other)[1]["reps"]) == 1  # the other account is untouched
    with d.db_factory() as db:
        assert db.query("SELECT COUNT(*) AS n FROM reps")[0]["n"] == 1  # only the other account's rep remains
        assert db.query("SELECT COUNT(*) AS n FROM users")[0]["n"] == 1


def test_a_failure_in_the_middle_of_a_push_rolls_everything_back():
    d = make_dispatcher()
    t = signup(d)
    original = Store.upsert_rep

    def explode(self, *a, **k):
        raise RuntimeError("disk on fire")

    Store.upsert_rep = explode  # type: ignore[assignment]
    try:
        status, _ = call(d, "POST", "/sync/push", {"sessions": [session()], "reps": [rep()]}, token=t)
    finally:
        Store.upsert_rep = original  # type: ignore[assignment]
    assert status == 500
    assert call(d, "GET", "/sessions", token=t)[1]["sessions"] == []  # the session written before the failure was rolled back
