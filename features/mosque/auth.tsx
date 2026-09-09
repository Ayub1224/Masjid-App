'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ShieldCheck, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDemoRole } from '@/components/app/providers';
import { usePreferences } from '@/components/app/preferences';
import {
  Field,
  Panel,
  PageTitle,
  Feedback,
  Form,
  Back,
} from '@/components/app/primitives';
export function Login({
  recover = false,
  invite = false,
}: {
  recover?: boolean;
  invite?: boolean;
}) {
  const [show, setShow] = useState(false),
    [notice, setNotice] = useState('');
  const { setRole } = useDemoRole();
  const router = useRouter();
  const { t } = usePreferences();
  return (
    <>
      <Back />
      <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-accent text-primary">
        {invite ? <ShieldCheck /> : <Mail />}
      </div>
      <PageTitle
        title={t(
          invite
            ? 'Accept your invitation'
            : recover
              ? 'Reset your PIN'
              : 'Welcome back',
          invite ? 'आमंत्रण स्वीकार करें' : recover ? 'पिन रीसेट करें' : 'आपका स्वागत है',
        )}
        description={t(
          'Your mosque. Your community.',
          'आपकी मस्जिद। आपका समुदाय।',
        )}
      />
      <Panel>
        <Form
          submit={t(
            invite ? 'Continue' : recover ? 'Send reset link' : 'Sign in',
            invite ? 'जारी रखें' : recover ? 'रीसेट लिंक भेजें' : 'लॉगिन करें',
          )}
          onSubmit={() =>
            setNotice(
              t(
                'Authentication is not connected in this frontend preview. No message was sent and no PIN was saved.',
                'इस पूर्वावलोकन में प्रमाणीकरण जुड़ा नहीं है। कोई संदेश नहीं भेजा गया और पिन सहेजा नहीं गया।',
              ),
            )
          }
        >
          <Field
            label={t('Phone or email', 'फोन या ईमेल')}
            name="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="you@example.com or +91 98…"
          />
          {!recover && (
            <div className="relative">
              <Field
                label={t('6-digit PIN', '6 अंकों का पिन')}
                name="pin"
                type={show ? 'text' : 'password'}
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                autoComplete={invite ? 'new-password' : 'current-password'}
              />
              <Button
                variant="ghost"
                type="button"
                className="absolute right-1 bottom-0.5 size-11"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          )}
          {!recover && !invite && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox name="remember" />
              {t('Keep me signed in on this device', 'इस डिवाइस पर लॉगिन रखें')}
            </label>
          )}
          <Feedback message={notice} />
        </Form>
        {!recover && !invite && (
          <Button
            variant="link"
            className="mt-3 h-11 w-full"
            onClick={() => router.push('/forgot-password')}
          >
            {t('Forgot PIN?', 'पिन भूल गए?')}
          </Button>
        )}
      </Panel>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t(
          'Members join by invitation from a mosque admin.',
          'सदस्य मस्जिद व्यवस्थापक के आमंत्रण से जुड़ते हैं।',
        )}
      </p>
      <div className="mt-7 border-t pt-6">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          {t('Explore the frontend', 'फ़्रंटएंड देखें')}
        </p>
        <Button
          variant="outline"
          className="h-12 w-full"
          onClick={() => {
            setRole('member');
            router.push('/home');
          }}
        >
          {t('Open member demo', 'सदस्य डेमो खोलें')}
          <ArrowRight />
        </Button>
      </div>
    </>
  );
}
