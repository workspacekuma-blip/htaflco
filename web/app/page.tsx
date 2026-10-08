import Link from 'next/link';
import Composer from '@/components/Composer';
import Front from '@/components/Front';
import PostSlider from '@/components/PostSlider';
import JoinBox from '@/components/JoinBox';

export default function Home() {
  return (
    <>
      <PostSlider />
      <Front />

      <section className="hero wrap">
        <h1>You don&apos;t have to be okay to start making something.</h1>
        <p className="lead">HTAFL is a community for people in a hard chapter who are still building. Hope, talent, art, fashion and life, made by people who are going through it.</p>
        <Composer />
      </section>

      <section className="band-section seen">
        <div className="wrap">
          <h2>If any of these sound like you, you&apos;re in the right place.</h2>
          <ul>
            <li>I used to make things. Then life got heavy.</li>
            <li>I have something in me and nowhere to put it.</li>
            <li>Everyone else seems further along.</li>
            <li>I&apos;m waiting until things settle down to begin.</li>
          </ul>
          <p>A hard chapter is not the whole book. You can make something right in the middle of it, and HTAFL exists to give that somewhere to land. <Link href="/about">Read what we believe</Link>.</p>
        </div>
      </section>

      <section className="band-section">
        <div className="wrap">
          <h2>Three things we do together.</h2>
          <div className="three">
            <div><h3>Create.</h3><p>Bring something into the world: a drawing, an outfit, a song, a photo, a first draft. Beginners and rebuilders welcome.</p></div>
            <div><h3>Overcome.</h3><p>Keep moving through the difficult part. Not by pretending it isn&apos;t there, but by turning it into something.</p></div>
            <div><h3>Connect.</h3><p>Nobody builds alone here. Respond to other creators, and help the person one step behind you.</p></div>
          </div>
        </div>
      </section>

      <section className="band-section">
        <div className="wrap">
          <h2>How it works, from first look to leading.</h2>
          <ol className="path">
            <li><h3>See yourself in it</h3><p>Stories from people at every stage, not only polished artists.</p></li>
            <li><h3>Try one small thing</h3><p>A prompt, a challenge, a sentence like the one above.</p></li>
            <li><h3>Share what you made</h3><p>Courage counts as much as skill.</p></li>
            <li><h3>Be seen</h3><p>We feature members, first-time creators and progress stories.</p></li>
            <li><h3>Come back and help</h3><p>Return for the next challenge, then mentor, host or organise for someone newer.</p></li>
          </ol>
        </div>
      </section>

      <section className="creed" id="join">
        <div className="wrap">
          <h2>We are The Creator Generation.</h2>
          <p>We were not created only to consume the world around us. We were created to imagine, build, express, solve, contribute, and leave something behind.</p>
          <p>Hope is something we can create.</p>
          <JoinBox />
        </div>
      </section>
    </>
  );
}
