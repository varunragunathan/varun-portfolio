import React from 'react';
import { Link } from 'react-router-dom';
import { COURSES } from '../data/courses';
import { useVCoins } from '../hooks/useVCoins';
import { Fade } from '../components/UI';
import './Learn.css';

function WalletBadge() {
  const { balance } = useVCoins();
  return (
    <div className="learn-wallet">
      <span className="learn-wallet__icon" aria-hidden="true">🪙</span>
      <span className="learn-wallet__amount">{balance}</span>
      <span>vCoins</span>
    </div>
  );
}

function CourseCard({ course }) {
  const { isModuleCompleted } = useVCoins();
  const completed = course.modules.filter(m => isModuleCompleted(m.id)).length;
  const total = course.modules.length;
  const pct = Math.round((completed / total) * 100);
  const totalLessons = course.modules.reduce(
    (sum, m) => sum + m.lessons.length + m.quiz.length,
    0,
  );

  return (
    <Fade>
      <div className="course-card">
        <div
          className="course-card__glow"
          aria-hidden="true"
          style={{
            background: `radial-gradient(ellipse at 30% 0%, rgba(${course.accentRgb}, 0.08) 0%, transparent 70%)`,
          }}
        />
        <div className="course-card__header">
          <div className="course-card__icon">{course.icon}</div>
          <div className="course-card__meta">
            <div className="course-card__label">course</div>
            <h2 className="course-card__title">{course.title}</h2>
            <p className="course-card__subtitle">{course.subtitle}</p>
          </div>
        </div>

        <p className="course-card__description">{course.description}</p>

        <div className="course-card__stats">
          <div className="course-card__stat">
            <span className="course-card__stat-value">{total}</span>
            <span className="course-card__stat-label">Modules</span>
          </div>
          <div className="course-card__stat">
            <span className="course-card__stat-value">{totalLessons}</span>
            <span className="course-card__stat-label">Lessons</span>
          </div>
          <div className="course-card__stat">
            <span className="course-card__stat-value" style={{ color: '#fbbf24' }}>
              {course.totalVCoins}
            </span>
            <span className="course-card__stat-label">vCoins</span>
          </div>
        </div>

        {completed > 0 && (
          <div className="course-card__progress">
            <div className="course-card__progress-bar">
              <div
                className="course-card__progress-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, var(--accent), ${course.accent})`,
                }}
              />
            </div>
            <div className="course-card__progress-text">
              {completed}/{total} modules · {pct}%
            </div>
          </div>
        )}

        <div className="module-list">
          {course.modules.map((mod, i) => {
            const done = isModuleCompleted(mod.id);
            return (
              <Link
                key={mod.id}
                to={`/learn/${course.id}/${mod.id}`}
                className={`module-item${done ? ' module-item--completed' : ''}`}
              >
                <div className="module-item__icon">{mod.icon}</div>
                <div className="module-item__info">
                  <div className="module-item__title">
                    {i + 1}. {mod.title}
                  </div>
                  <div className="module-item__lessons">
                    {mod.lessons.length} lessons · {mod.quiz.length} quiz questions
                  </div>
                </div>
                <div className="module-item__right">
                  <span className="module-item__coins">
                    🪙 {mod.vCoins}
                  </span>
                  <span className="module-item__status">
                    {done ? '✅' : '→'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Fade>
  );
}

export default function Learn() {
  return (
    <div className="learn-page">
      <Fade>
        <div className="learn-hero">
          <div className="learn-hero__eyebrow">learn</div>
          <h1 className="learn-hero__title">Learning Lab</h1>
          <p className="learn-hero__subtitle">
            Interactive courses on AI, ML, and engineering fundamentals.
            Complete modules, earn vCoins, and build real intuition.
          </p>
        </div>
      </Fade>

      <WalletBadge />

      {COURSES.map(course => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}
