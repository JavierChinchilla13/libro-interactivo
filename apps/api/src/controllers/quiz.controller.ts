import type { SubmitAnswersRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { ProgressService } from '../services/progress.service.js';
import type { QuizService } from '../services/quiz.service.js';
import type { QuizPublishService } from '../services/quizPublish.service.js';

interface QuizParams {
  quizId: string;
}
interface BookQuery {
  bookId: string;
}

export function createQuizController(quizzes: QuizService, progress: ProgressService) {
  const getIntro: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.getIntro(getAuth(res), params.quizId));
  };

  const startAttempt: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.startAttempt(getAuth(res), params.quizId));
  };

  const submitAnswers: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<
      SubmitAnswersRequest,
      unknown,
      { attemptId: string; stageId: string }
    >(res);
    res.json(await quizzes.submitAnswers(getAuth(res), params.attemptId, params.stageId, body));
  };

  const listResults: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, BookQuery>(res);
    res.json(await quizzes.listResults(getAuth(res).userId, query.bookId));
  };

  const getQuizResults: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await quizzes.getQuizResults(getAuth(res).userId, params.quizId));
  };

  const getProgress: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, BookQuery>(res);
    res.json(await progress.getProgress(getAuth(res).userId, query.bookId));
  };

  return { getIntro, startAttempt, submitAnswers, listResults, getQuizResults, getProgress };
}

export function createAdminQuizController(publisher: QuizPublishService) {
  const validateQuiz: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await publisher.validate(params.quizId));
  };

  const publish: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.status(201).json(await publisher.publish(getAuth(res), params.quizId));
  };

  const preview: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, QuizParams>(res);
    res.json(await publisher.preview(getAuth(res), params.quizId));
  };

  return { validateQuiz, publish, preview };
}
