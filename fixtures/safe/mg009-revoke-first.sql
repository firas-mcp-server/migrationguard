-- expect: none
SET lock_timeout = '5s';
REVOKE ALL ON TABLE old_events FROM app_user;
