"""Training of the personalized and generic networks + the fixed-rule baseline."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from .coach import rule_verdict
from .config import ALL_FEATS, KIN_FEATS


def fit_mlp(X: np.ndarray, y: np.ndarray, seed: int = 1):
    sc = StandardScaler().fit(X)
    clf = MLPClassifier(hidden_layer_sizes=(32, 16), activation="relu", alpha=1e-3, max_iter=400,
                        early_stopping=True, n_iter_no_change=15, random_state=seed)
    clf.fit(sc.transform(X), y)
    return sc, clf


def proba(sc, clf, X) -> np.ndarray:
    return clf.predict_proba(sc.transform(X))[:, 1]


def split_by_person(df: pd.DataFrame, seed: int = 0, train_frac: float = 0.7):
    people = df.person_id.unique().copy()
    np.random.default_rng(seed).shuffle(people)
    cut = int(train_frac * len(people))
    tr_ids = set(people[:cut])
    mask = df.person_id.isin(tr_ids)
    return df[mask].reset_index(drop=True), df[~mask].reset_index(drop=True)


def train_models(df: pd.DataFrame, seed: int = 0) -> dict:
    tr, te = split_by_person(df, seed)
    g_sc, g_clf = fit_mlp(tr[KIN_FEATS].values, tr.label.values)
    p_sc, p_clf = fit_mlp(tr[ALL_FEATS].values, tr.label.values)

    rule_pred = np.array([int(rule_verdict(row)[0]) for row in te[KIN_FEATS].to_dict("records")])
    metrics = dict(
        n_train_reps=int(len(tr)), n_test_reps=int(len(te)),
        n_test_people=int(te.person_id.nunique()),
        accuracy_personalized=float(accuracy_score(te.label, proba(p_sc, p_clf, te[ALL_FEATS].values) >= 0.5)),
        accuracy_generic=float(accuracy_score(te.label, proba(g_sc, g_clf, te[KIN_FEATS].values) >= 0.5)),
        accuracy_rule=float(accuracy_score(te.label, rule_pred)),
    )
    return dict(personalized=(p_sc, p_clf), generic=(g_sc, g_clf), train=tr, test=te, metrics=metrics)
