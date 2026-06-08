import { useState } from 'react';
import './App.css';
import InputPage from './InputPage';
import ResultPage from './ResultPage';

export type TripConditions = {
  departure: string;
  destination: string;
  date: string;
  people: string;
  days: string;
  budget: string;
  transport: string;
  pace: string;
  purposes: string[];
  requests: string;
};

export default function App() {
  const [page, setPage] = useState<'input' | 'result'>('input');
  const [conditions, setConditions] = useState<TripConditions | null>(null);

  const handleSubmit = (conds: TripConditions) => {
    setConditions(conds);
    setPage('result');
  };

  const handleBack = () => {
    setPage('input');
  };

  if (page === 'result' && conditions) {
    return <ResultPage conditions={conditions} onBack={handleBack} />;
  }

  return <InputPage onSubmit={handleSubmit} initialConditions={conditions} />;
}
